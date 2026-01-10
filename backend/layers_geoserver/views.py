import json
import re
import os
import tempfile
from pathlib import Path
from typing import Iterable
import datetime
import warnings

from django.db import transaction
from django.http import HttpResponseNotAllowed, JsonResponse
from django.shortcuts import get_object_or_404, render
from django.views.decorators.csrf import csrf_exempt

from .geoserver import (
    GeoServerError,
    get_layer_attributes,
    get_layer_bboxes,
    get_layer_native_crs,
    list_layers_in_workspace,
    list_workspaces,
    suggest_layer_field_values,
)
from .models import Layer, RootGroup, ThematicGroup


def _normalize_epsg(v: str | None) -> str | None:
    if not v:
        return None
    s = str(v).strip()
    if not s:
        return None
    if s.upper().startswith("EPSG:"):
        return s.upper()
    # allow "4326"
    if s.isdigit():
        return f"EPSG:{s}"
    return s


def _guess_crs_from_lonlat_bounds(bounds: list[float] | tuple[float, float, float, float] | None) -> str | None:
    if not bounds or len(bounds) != 4:
        return None
    minx, miny, maxx, maxy = [float(x) for x in bounds]
    # heuristic: looks like degrees
    if -180 <= minx <= 180 and -180 <= maxx <= 180 and -90 <= miny <= 90 and -90 <= maxy <= 90:
        return "EPSG:4326"
    return None


def _guess_crs_from_xy_bounds(bounds: list[float] | tuple[float, float, float, float] | None) -> str | None:
    """Heuristics for common coordinate ranges.

    This cannot reliably identify arbitrary projected CRSs, but it can distinguish the most common cases:
    - lon/lat degrees -> EPSG:4326
    """

    epsg4326 = _guess_crs_from_lonlat_bounds(bounds)
    if epsg4326:
        return epsg4326

    if not bounds or len(bounds) != 4:
        return None
    minx, miny, maxx, maxy = [float(x) for x in bounds]

    return None


def _as_geojson_dict(geojson_str: str):
    try:
        return json.loads(geojson_str)
    except Exception:
        return None


def _json_default_for_geojson(obj):
    """Fallback encoder for types that Python's json can't serialize.

    This is intentionally permissive because real-world GIS files frequently contain
    pandas/numpy scalar types and timestamps.
    """

    # datetime/date
    if isinstance(obj, (datetime.datetime, datetime.date)):
        return obj.isoformat()

    # pandas Timestamp / NaT
    try:
        import pandas as pd

        if isinstance(obj, pd.Timestamp):
            try:
                return obj.to_pydatetime().isoformat()
            except Exception:
                return obj.isoformat()
    except Exception:
        pass

    # numpy scalars (including datetime64)
    try:
        import numpy as np

        if isinstance(obj, np.datetime64):
            try:
                import pandas as pd

                return pd.to_datetime(obj).to_pydatetime().isoformat()
            except Exception:
                return str(obj)

        if isinstance(obj, np.generic):
            return obj.item()
    except Exception:
        pass

    # Decimal / UUID
    try:
        import decimal

        if isinstance(obj, decimal.Decimal):
            return float(obj)
    except Exception:
        pass

    try:
        import uuid

        if isinstance(obj, uuid.UUID):
            return str(obj)
    except Exception:
        pass

    return str(obj)


def _gdf_to_geojson_dict(gdf):
    """Convert a GeoDataFrame into a JSON-serializable GeoJSON dict.

    Prefer __geo_interface__ with a permissive json default handler, because
    GeoDataFrame.to_json() can fail on pandas.Timestamp in properties or ids.
    """

    try:
        payload = getattr(gdf, "__geo_interface__", None)
        if payload is not None:
            txt = json.dumps(payload, ensure_ascii=False, default=_json_default_for_geojson)
            return json.loads(txt)
    except Exception:
        pass

    try:
        return _as_geojson_dict(gdf.to_json())
    except Exception:
        return None


def _find_first_present(d: dict, keys: Iterable[str]) -> str | None:
    for k in keys:
        if k in d and d[k] not in (None, ""):
            return str(d[k])
    return None


def _detect_geojson_crs_from_payload(payload: dict) -> str | None:
    # GeoJSON 'crs' member is deprecated but sometimes present.
    crs = payload.get("crs")
    if isinstance(crs, dict):
        props = crs.get("properties")
        if isinstance(props, dict):
            name = props.get("name")
            if isinstance(name, str) and name:
                # common: "urn:ogc:def:crs:EPSG::4326"
                upper = name.upper()
                if "EPSG" in upper:
                    digits = "".join(ch for ch in upper.split("EPSG")[-1] if ch.isdigit())
                    if digits:
                        return f"EPSG:{digits}"
                return name
    return None


def _safe_error(exc: Exception) -> str:
    # Keep errors reasonably readable without leaking internals.
    msg = str(exc) or exc.__class__.__name__
    return msg[:500]


def _read_vector_file_to_gdf(
    *,
    input_path: str,
    fmt: str,
    source_crs_override: str | None = None,
    csv_x: str | None = None,
    csv_y: str | None = None,
    csv_wkt: str | None = None,
    gpkg_layer: str | None = None,
):
    import geopandas as gpd

    fmt = fmt.lower()
    if fmt in {"geojson", "json"}:
        # Read as text first so we can try to detect embedded CRS if geopandas returns None.
        payload = None
        try:
            with open(input_path, "rb") as f:
                raw = f.read()
            payload = json.loads(raw.decode("utf-8"))
        except Exception:
            payload = None

        gdf = gpd.read_file(input_path)

        if gdf.crs is None:
            detected = _detect_geojson_crs_from_payload(payload) if isinstance(payload, dict) else None
            detected = _normalize_epsg(detected)
            if not detected:
                # fallback heuristic
                try:
                    detected = _guess_crs_from_lonlat_bounds(getattr(gdf, "total_bounds", None))
                except Exception:
                    detected = None
            if detected:
                gdf = gdf.set_crs(detected, allow_override=True)

        if source_crs_override:
            gdf = gdf.set_crs(source_crs_override, allow_override=True)

        return gdf

    if fmt == "gpkg":
        kwargs = {}
        if gpkg_layer:
            kwargs["layer"] = gpkg_layer
        # pyogrio (GDAL/OGR) can emit noisy RuntimeWarning for some GeoPackages.
        # Upload should still succeed, so we silence these warnings during read.
        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", category=RuntimeWarning, module=r"pyogrio(\..*)?$")
            gdf = gpd.read_file(input_path, **kwargs)
        if source_crs_override:
            gdf = gdf.set_crs(source_crs_override, allow_override=True)
        return gdf

    if fmt == "shp":
        gdf = gpd.read_file(input_path)
        if source_crs_override:
            gdf = gdf.set_crs(source_crs_override, allow_override=True)
        return gdf

    if fmt == "csv":
        import pandas as pd
        from shapely import wkt as shapely_wkt

        df = pd.read_csv(input_path)

        # Allow CRS embedded as a constant field.
        cols_map = {c.lower(): c for c in df.columns}
        embedded_crs_col = _find_first_present(cols_map, ["crs", "epsg", "srid", "srs"])
        embedded_crs = None
        if embedded_crs_col:
            col = cols_map.get(str(embedded_crs_col).lower())
            if col:
                vals = df[col].dropna().astype(str)
                if not vals.empty:
                    embedded_crs = _normalize_epsg(vals.iloc[0])

        crs = _normalize_epsg(source_crs_override) or embedded_crs

        # Geometry creation: WKT preferred, else XY.
        cols_lower = {c.lower(): c for c in df.columns}
        auto_wkt = cols_lower.get("wkt") or cols_lower.get("geom") or cols_lower.get("geometry")

        wkt_col = None
        if csv_wkt and csv_wkt in df.columns:
            wkt_col = csv_wkt
        elif auto_wkt and auto_wkt in df.columns:
            wkt_col = auto_wkt

        if wkt_col:
            geom = df[wkt_col].dropna().astype(str).map(shapely_wkt.loads)
            gdf = gpd.GeoDataFrame(df, geometry=geom)
        else:
            x_col = (
                (csv_x if csv_x and csv_x in df.columns else None)
                or cols_lower.get("x")
                or cols_lower.get("lon")
                or cols_lower.get("lng")
                or cols_lower.get("long")
                or cols_lower.get("longitude")
            )
            y_col = (
                (csv_y if csv_y and csv_y in df.columns else None)
                or cols_lower.get("y")
                or cols_lower.get("lat")
                or cols_lower.get("latitude")
            )

            if not x_col or not y_col:
                raise ValueError("CSV precisa ter colunas X e Y (ex: lon/lat ou x/y) ou uma coluna WKT (wkt/geom/geometry)")

            gdf = gpd.GeoDataFrame(df, geometry=gpd.points_from_xy(df[x_col], df[y_col]))

            if not crs:
                # Heuristics based on ranges (only safe for lon/lat degrees)
                try:
                    bounds = [
                        float(gdf.geometry.x.min()),
                        float(gdf.geometry.y.min()),
                        float(gdf.geometry.x.max()),
                        float(gdf.geometry.y.max()),
                    ]
                    crs = _guess_crs_from_xy_bounds(bounds)
                except Exception:
                    crs = None

            if not crs:
                # If this is clearly *not* lon/lat degrees, we cannot infer the EPSG reliably from X/Y alone.
                # Allow a server-side default CRS (no UI prompt) to support deployments where CSVs share a known CRS.
                default_projected = os.environ.get("MCP_CSV_DEFAULT_PROJECTED_CRS")
                crs = _normalize_epsg(default_projected)

        if not crs:
            raise ValueError(
                "Não foi possível reconhecer a projeção do CSV apenas pelos campos X/Y. "
                "Inclua uma coluna 'epsg'/'crs' (ex: 4326 ou EPSG:4326) ou configure um CRS padrão no servidor."
            )

        gdf = gdf.set_crs(crs, allow_override=True)
        return gdf

    raise ValueError("Formato não suportado")


def tree_builder_view(request):
    return render(request, "layers_geoserver/tree_builder.html")


def _json_error(message: str, status: int = 400):
    return JsonResponse({"error": message}, status=status)


def _sanitize_gdf_for_geojson(gdf):
    """Ensure feature properties are JSON-serializable.

    Some drivers (notably GPKG via pandas/geopandas) may load date/time fields as pandas.Timestamp,
    which can break GeoDataFrame.to_json() with: "Object of type Timestamp is not JSON serializable".
    """

    try:
        import pandas as pd
    except Exception:
        return gdf

    try:
        # Work on a shallow copy to avoid mutating upstream and ensure index is JSON-safe.
        out = gdf.copy()
        try:
            # GeoDataFrame.to_json can serialize the index as feature 'id'. If the index contains
            # pandas.Timestamp (common when reading from some data sources), it will crash.
            out = out.reset_index(drop=True)
        except Exception:
            pass

        def conv(v):
            if v is None:
                return None
            try:
                if pd.isna(v):
                    return None
            except Exception:
                pass

            # Handle nested structures (some drivers load JSON-ish columns as python objects)
            if isinstance(v, dict):
                return {str(k): conv(val) for k, val in v.items()}
            if isinstance(v, (list, tuple, set)):
                t = [conv(x) for x in v]
                return t if not isinstance(v, tuple) else tuple(t)

            # pandas / python datetimes
            if isinstance(v, pd.Timestamp):
                try:
                    return v.to_pydatetime().isoformat()
                except Exception:
                    return v.isoformat()
            if isinstance(v, (datetime.datetime, datetime.date)):
                return v.isoformat()

            # numpy datetime64 inside object columns
            try:
                import numpy as np

                if isinstance(v, np.datetime64):
                    return pd.to_datetime(v).to_pydatetime().isoformat()
            except Exception:
                pass

            return v

        for col in list(getattr(out, "columns", [])):
            if col == getattr(out, "geometry", None) or col == "geometry":
                continue

            s = out[col]
            # datetime64[ns] / datetime64[ns, tz]
            try:
                if pd.api.types.is_datetime64_any_dtype(s):
                    out[col] = s.map(conv)
                    continue
            except Exception:
                pass

            # object columns (including nested objects)
            try:
                if pd.api.types.is_object_dtype(s):
                    out[col] = s.map(conv)
            except Exception:
                pass

        return out
    except Exception:
        return gdf


def _parse_json_body(request):
    if not request.body:
        return {}
    try:
        return json.loads(request.body.decode("utf-8"))
    except json.JSONDecodeError:
        return None


def _serialize_root_group(rg: RootGroup):
    return {
        "id": rg.id,
        "title": rg.title,
        "serviceType": rg.service_type,
        "workspace": rg.workspace,
        "visible": rg.visible,
    }


def _serialize_thematic_group(g: ThematicGroup):
    return {
        "id": g.id,
        "rootGroupId": g.root_group_id,
        "title": g.title,
        "visible": g.visible,
    }


def _serialize_layer(layer: Layer):
    return {
        "id": layer.id,
        "rootGroupId": layer.root_group_id,
        "thematicGroupId": layer.thematic_group_id,
        "title": layer.title,
        "layerName": layer.layer_name,
        "workspace": layer.workspace,
        "serviceType": layer.service_type,
        "nativeCrs": layer.native_crs,
        "visible": layer.visible,
        "geometryType": layer.geometry_type,
        "minZoom": layer.min_zoom,
        "queryable": layer.queryable,
        "queryableFields": layer.queryable_fields,
        "tableFields": layer.table_fields,
        "filter": layer.filter,
        "popupTemplate": layer.popup_template,
        "styleConfig": layer.style_config,
    }


_SLUG_SAFE_RE = re.compile(r"[^a-zA-Z0-9_-]+")


@csrf_exempt
def save_tree(request):
    if request.method != "POST":
        return HttpResponseNotAllowed(["POST"])

    data = _parse_json_body(request)
    if data is None:
        return _json_error("Invalid JSON")

    # Ensure data is a list
    if not isinstance(data, list):
        data = [data]

    try:
        with transaction.atomic():
            seen_root_ids: set[str] = set()
            seen_group_ids: set[str] = set()
            seen_layer_ids: set[str] = set()

            for root_data in data:
                # Create or Update RootGroup
                root_id = (root_data.get("id") or "").strip()
                root_defaults = {
                    "title": root_data["title"],
                    "service_type": root_data["service_type"],
                    "workspace": root_data["workspace"],
                    "visible": root_data["visible"],
                }

                if root_id and root_id not in seen_root_ids and RootGroup.objects.filter(pk=root_id).exists():
                    root_group, created = RootGroup.objects.update_or_create(
                        id=root_id,
                        defaults=root_defaults,
                    )
                else:
                    root_group = RootGroup(**root_defaults)
                    root_group.save()

                if root_id:
                    seen_root_ids.add(root_id)
                
                # Process Root Layers
                # First, we might want to clear existing layers/groups if we want a full sync?
                # The current admin logic is additive/update-only. It doesn't delete removed items.
                # For a "Save" button in an editor, users might expect deletions to persist.
                # However, implementing full sync (delete missing) is riskier without explicit confirmation.
                # Given the user asked to "save", I'll stick to the admin logic (update_or_create) for now,
                # as it matches the "Import JSON" behavior the user is familiar with.
                # If they delete something in the UI, it won't be deleted in DB with this logic.
                # But let's follow the requested "Import JSON" logic pattern first.
                
                # Actually, if I'm editing a tree, I probably want to replace the structure.
                # But let's stick to the safe update_or_create for now to avoid accidental data loss.
                
                for layer_data in root_data.get("layers", []):
                    layer_id = (layer_data.get("id") or "").strip()
                    layer_defaults = {
                        "title": layer_data["title"],
                        "layer_name": layer_data["layer_name"],
                        "workspace": layer_data["workspace"],
                        "service_type": layer_data["service_type"],
                        "native_crs": layer_data.get("native_crs"),
                        "visible": layer_data["visible"],
                        "geometry_type": layer_data["geometry_type"],
                        "min_zoom": layer_data.get("min_zoom"),
                        "queryable": layer_data["queryable"],
                        "queryable_fields": layer_data.get("queryable_fields"),
                        "table_fields": layer_data.get("table_fields"),
                        "filter": layer_data.get("filter"),
                        "popup_template": layer_data.get("popup_template"),
                        "style_config": layer_data.get("style_config"),
                        "root_group": root_group,
                        "thematic_group": None,
                    }

                    can_update_layer = False
                    if layer_id and layer_id not in seen_layer_ids:
                        existing = Layer.objects.filter(pk=layer_id).select_related("root_group", "thematic_group").first()
                        if existing and existing.root_group_id == root_group.id and existing.thematic_group_id is None:
                            can_update_layer = True

                    if can_update_layer:
                        Layer.objects.update_or_create(id=layer_id, defaults=layer_defaults)
                        seen_layer_ids.add(layer_id)
                    else:
                        layer = Layer(**layer_defaults)
                        layer.save()

                # Process Thematic Groups
                for group_data in root_data.get("thematic_groups", []):
                    group_id = (group_data.get("id") or "").strip()
                    group_defaults = {
                        "title": group_data["title"],
                        "visible": group_data["visible"],
                        "root_group": root_group,
                    }

                    can_update_group = False
                    if group_id and group_id not in seen_group_ids:
                        existing_group = ThematicGroup.objects.filter(pk=group_id).only("id", "root_group_id").first()
                        if existing_group and existing_group.root_group_id == root_group.id:
                            can_update_group = True

                    if can_update_group:
                        thematic_group, _ = ThematicGroup.objects.update_or_create(
                            id=group_id,
                            defaults=group_defaults,
                        )
                        seen_group_ids.add(group_id)
                    else:
                        thematic_group = ThematicGroup(**group_defaults)
                        thematic_group.save()

                    for layer_data in group_data.get("layers", []):
                        layer_id = (layer_data.get("id") or "").strip()
                        layer_defaults = {
                            "title": layer_data["title"],
                            "layer_name": layer_data["layer_name"],
                            "workspace": layer_data["workspace"],
                            "service_type": layer_data["service_type"],
                            "native_crs": layer_data.get("native_crs"),
                            "visible": layer_data["visible"],
                            "geometry_type": layer_data["geometry_type"],
                            "min_zoom": layer_data.get("min_zoom"),
                            "queryable": layer_data["queryable"],
                            "queryable_fields": layer_data.get("queryable_fields"),
                            "table_fields": layer_data.get("table_fields"),
                            "filter": layer_data.get("filter"),
                            "popup_template": layer_data.get("popup_template"),
                            "style_config": layer_data.get("style_config"),
                            "root_group": root_group,
                            "thematic_group": thematic_group,
                        }

                        can_update_layer = False
                        if layer_id and layer_id not in seen_layer_ids:
                            existing = Layer.objects.filter(pk=layer_id).select_related("root_group", "thematic_group").first()
                            if (
                                existing
                                and existing.root_group_id == root_group.id
                                and existing.thematic_group_id == thematic_group.id
                            ):
                                can_update_layer = True

                        if can_update_layer:
                            Layer.objects.update_or_create(id=layer_id, defaults=layer_defaults)
                            seen_layer_ids.add(layer_id)
                        else:
                            layer = Layer(**layer_defaults)
                            layer.save()
        return JsonResponse({"status": "success", "message": "Tree saved successfully"})
    except Exception as exc:
        return _json_error(str(exc), status=500)


@csrf_exempt
def layers_tree(request):
    if request.method != "GET":
        return HttpResponseNotAllowed(["GET"])

    roots = RootGroup.objects.all().order_by("title")
    result = []

    for rg in roots:
        thematic_groups = rg.thematic_groups.all().order_by("title")
        direct_layers = rg.layers.filter(thematic_group__isnull=True).order_by("title")

        result.append(
            {
                **_serialize_root_group(rg),
                "layers": [_serialize_layer(l) for l in direct_layers],
                "thematicGroups": [
                    {
                        **_serialize_thematic_group(g),
                        "layers": [_serialize_layer(l) for l in g.layers.all().order_by("title")],
                    }
                    for g in thematic_groups
                ],
            }
        )

    return JsonResponse(result, safe=False)


def _apply_fields(instance, data: dict, mapping: dict):
    for api_key, model_field in mapping.items():
        if api_key in data:
            setattr(instance, model_field, data[api_key])


@csrf_exempt
def root_groups_collection(request):
    if request.method == "GET":
        roots = RootGroup.objects.all().order_by("title")
        return JsonResponse([_serialize_root_group(r) for r in roots], safe=False)

    if request.method == "POST":
        data = _parse_json_body(request)
        if data is None:
            return _json_error("Invalid JSON")

        required = ["title", "serviceType", "workspace"]
        missing = [k for k in required if k not in data]
        if missing:
            return _json_error(f"Missing fields: {', '.join(missing)}")

        rg = RootGroup(
            title=data["title"],
            service_type=data["serviceType"],
            workspace=data["workspace"],
            visible=bool(data.get("visible", True)),
        )
        if data.get("id"):
            rg.id = data["id"]
        try:
            rg.full_clean()
            rg.save()
        except Exception as exc:
            return _json_error(str(exc), status=400)

        return JsonResponse(_serialize_root_group(rg), status=201)

    return HttpResponseNotAllowed(["GET", "POST"])


@csrf_exempt
def root_group_detail(request, root_group_id: str):
    rg = get_object_or_404(RootGroup, pk=root_group_id)

    if request.method == "GET":
        return JsonResponse(_serialize_root_group(rg))

    if request.method in {"PUT", "PATCH"}:
        data = _parse_json_body(request)
        if data is None:
            return _json_error("Invalid JSON")

        mapping = {
            "title": "title",
            "serviceType": "service_type",
            "workspace": "workspace",
            "visible": "visible",
        }
        _apply_fields(rg, data, mapping)
        try:
            rg.full_clean()
            rg.save()
        except Exception as exc:
            return _json_error(str(exc), status=400)

        return JsonResponse(_serialize_root_group(rg))

    if request.method == "DELETE":
        rg.delete()
        return JsonResponse({"deleted": True})

    return HttpResponseNotAllowed(["GET", "PUT", "PATCH", "DELETE"])


@csrf_exempt
def thematic_groups_collection(request):
    if request.method == "GET":
        groups = ThematicGroup.objects.select_related("root_group").all().order_by("root_group_id", "title")
        return JsonResponse([_serialize_thematic_group(g) for g in groups], safe=False)

    if request.method == "POST":
        data = _parse_json_body(request)
        if data is None:
            return _json_error("Invalid JSON")

        required = ["rootGroupId", "title"]
        missing = [k for k in required if k not in data]
        if missing:
            return _json_error(f"Missing fields: {', '.join(missing)}")

        root = get_object_or_404(RootGroup, pk=data["rootGroupId"])
        g = ThematicGroup(
            root_group=root,
            title=data["title"],
            visible=bool(data.get("visible", True)),
        )
        if data.get("id"):
            g.id = data["id"]
        try:
            g.full_clean()
            g.save()
        except Exception as exc:
            return _json_error(str(exc), status=400)

        return JsonResponse(_serialize_thematic_group(g), status=201)

    return HttpResponseNotAllowed(["GET", "POST"])


@csrf_exempt
def thematic_group_detail(request, thematic_group_id: str):
    g = get_object_or_404(ThematicGroup, pk=thematic_group_id)

    if request.method == "GET":
        return JsonResponse(_serialize_thematic_group(g))

    if request.method in {"PUT", "PATCH"}:
        data = _parse_json_body(request)
        if data is None:
            return _json_error("Invalid JSON")

        if "rootGroupId" in data:
            g.root_group = get_object_or_404(RootGroup, pk=data["rootGroupId"])

        mapping = {"title": "title", "visible": "visible"}
        _apply_fields(g, data, mapping)

        try:
            g.full_clean()
            g.save()
        except Exception as exc:
            return _json_error(str(exc), status=400)

        return JsonResponse(_serialize_thematic_group(g))

    if request.method == "DELETE":
        g.delete()
        return JsonResponse({"deleted": True})

    return HttpResponseNotAllowed(["GET", "PUT", "PATCH", "DELETE"])


@csrf_exempt
def layers_collection(request):
    if request.method == "GET":
        layers = Layer.objects.select_related("root_group", "thematic_group").all().order_by(
            "root_group_id", "thematic_group_id", "title"
        )
        return JsonResponse([_serialize_layer(l) for l in layers], safe=False)

    if request.method == "POST":
        data = _parse_json_body(request)
        if data is None:
            return _json_error("Invalid JSON")

        required = ["rootGroupId", "title", "layerName", "geometryType"]
        missing = [k for k in required if k not in data]
        if missing:
            return _json_error(f"Missing fields: {', '.join(missing)}")

        root = get_object_or_404(RootGroup, pk=data["rootGroupId"])
        thematic = None
        if data.get("thematicGroupId"):
            thematic = get_object_or_404(ThematicGroup, pk=data["thematicGroupId"])

        layer = Layer(
            root_group=root,
            thematic_group=thematic,
            title=data["title"],
            layer_name=data["layerName"],
            workspace=root.workspace,
            service_type=root.service_type,
            native_crs=data.get("nativeCrs"),
            visible=bool(data.get("visible", True)),
            geometry_type=data["geometryType"],
            min_zoom=data.get("minZoom"),
            queryable=bool(data.get("queryable", False)),
            queryable_fields=data.get("queryableFields") or [],
            table_fields=data.get("tableFields") or [],
            filter=data.get("filter"),
            popup_template=data.get("popupTemplate"),
            style_config=data.get("styleConfig"),
        )
        if data.get("id"):
            layer.id = data["id"]

        # If not provided, try to fetch the CRS from GeoServer (best-effort).
        if not layer.native_crs:
            try:
                layer.native_crs = get_layer_native_crs(layer.workspace, layer.layer_name)
            except Exception:
                pass

        try:
            layer.save()
        except Exception as exc:
            return _json_error(str(exc), status=400)

        return JsonResponse(_serialize_layer(layer), status=201)

    return HttpResponseNotAllowed(["GET", "POST"])


@csrf_exempt
def layer_detail(request, layer_id: str):
    layer = get_object_or_404(Layer, pk=layer_id)

    if request.method == "GET":
        return JsonResponse(_serialize_layer(layer))

    if request.method in {"PUT", "PATCH"}:
        data = _parse_json_body(request)
        if data is None:
            return _json_error("Invalid JSON")

        if "rootGroupId" in data:
            layer.root_group = get_object_or_404(RootGroup, pk=data["rootGroupId"])
            layer.workspace = layer.root_group.workspace
            layer.service_type = layer.root_group.service_type

        if "thematicGroupId" in data:
            if data["thematicGroupId"] is None:
                layer.thematic_group = None
            else:
                layer.thematic_group = get_object_or_404(ThematicGroup, pk=data["thematicGroupId"])

        mapping = {
            "title": "title",
            "layerName": "layer_name",
            "nativeCrs": "native_crs",
            "visible": "visible",
            "geometryType": "geometry_type",
            "minZoom": "min_zoom",
            "queryable": "queryable",
            "queryableFields": "queryable_fields",
            "tableFields": "table_fields",
            "filter": "filter",
            "popupTemplate": "popup_template",
            "styleConfig": "style_config",
        }
        _apply_fields(layer, data, mapping)

        try:
            layer.save()
        except Exception as exc:
            return _json_error(str(exc), status=400)

        # If CRS is missing, refresh from GeoServer after save (best-effort).
        if not layer.native_crs:
            try:
                crs = get_layer_native_crs(layer.workspace, layer.layer_name)
                if crs:
                    layer.native_crs = crs
                    layer.save(update_fields=["native_crs"])
            except Exception:
                pass

        return JsonResponse(_serialize_layer(layer))

    if request.method == "DELETE":
        layer.delete()
        return JsonResponse({"deleted": True})

    return HttpResponseNotAllowed(["GET", "PUT", "PATCH", "DELETE"])


@csrf_exempt
def geoserver_workspaces(request):
    if request.method != "GET":
        return HttpResponseNotAllowed(["GET"])

    try:
        return JsonResponse({"workspaces": list_workspaces()})
    except GeoServerError as exc:
        return _json_error(str(exc), status=502)


@csrf_exempt
def geoserver_workspace_layers(request, workspace: str):
    if request.method != "GET":
        return HttpResponseNotAllowed(["GET"])

    service_type = request.GET.get("service_type") or request.GET.get("serviceType") or ""
    try:
        layers = list_layers_in_workspace(workspace=workspace, service_type=service_type)
        return JsonResponse({"workspace": workspace, "serviceType": service_type.upper(), "layers": layers})
    except GeoServerError as exc:
        return _json_error(str(exc), status=502)


@csrf_exempt
def geoserver_layer_attributes(request, workspace: str, layer_name: str):
    if request.method != "GET":
        return HttpResponseNotAllowed(["GET"])

    try:
        attributes = get_layer_attributes(workspace, layer_name)
        return JsonResponse({"workspace": workspace, "layerName": layer_name, "attributes": attributes})
    except GeoServerError as exc:
        return _json_error(str(exc), status=502)


@csrf_exempt
def geoserver_layer_native_crs(request, workspace: str, layer_name: str):
    if request.method != "GET":
        return HttpResponseNotAllowed(["GET"])

    try:
        crs = get_layer_native_crs(workspace, layer_name)
        return JsonResponse({"workspace": workspace, "layerName": layer_name, "nativeCrs": crs})
    except GeoServerError as exc:
        return _json_error(str(exc), status=502)


@csrf_exempt
def geoserver_layer_bbox(request, workspace: str, layer_name: str):
    if request.method != "GET":
        return HttpResponseNotAllowed(["GET"])

    try:
        data = get_layer_bboxes(workspace, layer_name) or {}
        # Public WMS base (not /rest)
        from django.conf import settings

        base = getattr(settings, "GEOSERVER_BASE_URL", "").rstrip("/")
        wms_url = f"{base}/wms" if base else ""
        return JsonResponse({"workspace": workspace, "layerName": layer_name, "bboxes": data, "wmsUrl": wms_url})
    except GeoServerError as exc:
        return _json_error(str(exc), status=502)


@csrf_exempt
def geoserver_layer_suggest(request, workspace: str, layer_name: str):
    if request.method != "GET":
        return HttpResponseNotAllowed(["GET"])

    field = request.GET.get("field") or ""
    q = request.GET.get("q")
    limit = request.GET.get("limit") or "10"

    try:
        suggestions = suggest_layer_field_values(workspace, layer_name, field=field, q=q, limit=int(limit))
        return JsonResponse(
            {
                "workspace": workspace,
                "layerName": layer_name,
                "field": field,
                "q": q or "",
                "suggestions": suggestions,
            }
        )
    except GeoServerError as exc:
        # Field validation errors should be 400; GeoServer/network issues 502.
        msg = str(exc)
        if msg == "Invalid field":
            return _json_error(msg, status=400)
        return _json_error(msg, status=502)


@csrf_exempt
def upload_user_layer(request):
    if request.method != "POST":
        return HttpResponseNotAllowed(["POST"])

    # Accept either a single 'file' or multiple 'files' (needed for Shapefile components)
    files = []
    if request.FILES.get("file"):
        files = [request.FILES["file"]]
    else:
        files = list(request.FILES.getlist("files"))

    if not files:
        return _json_error("Nenhum arquivo enviado")

    # Normalize parameters
    layer_title = (request.POST.get("name") or "").strip() or None
    if not layer_title:
        return _json_error("O nome da camada é obrigatório", status=400)
    # These optional overrides exist for API clients, but the UI does not request them.
    source_crs_override = _normalize_epsg(request.POST.get("sourceCrs") or request.POST.get("source_crs"))
    csv_x = request.POST.get("csvX")
    csv_y = request.POST.get("csvY")
    csv_wkt = request.POST.get("csvWkt")
    gpkg_layer = request.POST.get("gpkgLayer")

    # Determine format
    exts = [Path(f.name).suffix.lower() for f in files]
    fmt = None

    if ".shp" in exts:
        fmt = "shp"
        required = {".shp", ".shx", ".dbf", ".prj"}
        missing = required - set(exts)
        if missing:
            return _json_error(
                "Shapefile requer os arquivos obrigatórios: .shp, .shx, .dbf, .prj (faltando: %s)" % ", ".join(sorted(missing))
            )
    elif any(e in {".geojson", ".json"} for e in exts):
        fmt = "geojson"
    elif ".gpkg" in exts:
        fmt = "gpkg"
    elif ".csv" in exts:
        fmt = "csv"
    else:
        return _json_error("Formato não suportado. Use CSV, GeoJSON, Shapefile ou GPKG.")

    try:
        with tempfile.TemporaryDirectory(prefix="upload_layer_") as tmpdir:
            tmpdir_path = Path(tmpdir)

            main_path: Path | None = None
            for f in files:
                name = Path(f.name).name
                out = tmpdir_path / name
                with open(out, "wb") as w:
                    for chunk in f.chunks():
                        w.write(chunk)
                if out.suffix.lower() in {".shp", ".geojson", ".json", ".csv", ".gpkg"}:
                    main_path = out

            if fmt == "shp":
                # choose the .shp file as main
                shp_files = [tmpdir_path / Path(f.name).name for f in files if Path(f.name).suffix.lower() == ".shp"]
                main_path = shp_files[0] if shp_files else main_path

            if not main_path or not main_path.exists():
                return _json_error("Não foi possível localizar o arquivo principal do upload")

            # If GeoPackage has multiple layers and the client didn't select one, return the list for selection.
            if fmt == "gpkg" and not gpkg_layer:
                layer_names: list[str] = []
                try:
                    try:
                        import pyogrio

                        with warnings.catch_warnings():
                            warnings.filterwarnings("ignore", category=RuntimeWarning, module=r"pyogrio(\..*)?$")
                            layers_info = pyogrio.list_layers(str(main_path))
                        # pyogrio returns a pandas DataFrame-like (or list) depending on version
                        if hasattr(layers_info, "__iter__") and not isinstance(layers_info, (str, bytes)):
                            # DataFrame: columns include 'name'
                            if hasattr(layers_info, "get"):
                                # DataFrame-like
                                try:
                                    names = layers_info["name"].tolist()  # type: ignore[index]
                                    layer_names = [str(n) for n in names]
                                except Exception:
                                    pass
                            if not layer_names:
                                # list of tuples?
                                try:
                                    layer_names = [str(r[0]) for r in layers_info]  # type: ignore[index]
                                except Exception:
                                    layer_names = []
                    except Exception:
                        import fiona

                        layer_names = [str(x) for x in fiona.listlayers(str(main_path))]
                except Exception:
                    layer_names = []

                layer_names = [x for x in layer_names if x]
                if len(layer_names) == 1:
                    gpkg_layer = layer_names[0]
                elif len(layer_names) > 1:
                    return JsonResponse(
                        {
                            "error": "GeoPackage possui múltiplas camadas. Selecione qual deseja importar.",
                            "needsLayerSelection": True,
                            "layers": layer_names,
                        },
                        status=409,
                    )

            gdf = _read_vector_file_to_gdf(
                input_path=str(main_path),
                fmt=fmt,
                source_crs_override=source_crs_override,
                csv_x=csv_x,
                csv_y=csv_y,
                csv_wkt=csv_wkt,
                gpkg_layer=gpkg_layer,
            )

            if getattr(gdf, "crs", None) is None:
                return _json_error(
                    "Não foi possível reconhecer a projeção. Para CSV, inclua uma coluna 'epsg'/'crs' (ex: 4326 ou EPSG:4326) ou inclua o EPSG no nome do arquivo (ex: *_EPSG4326.csv). Para pontos em lon/lat, use coordenadas em graus."
                )

            # Reproject to WGS84 for interchange with the frontend
            source_crs_str = None
            try:
                source_crs_str = gdf.crs.to_string() if gdf.crs else None
            except Exception:
                source_crs_str = str(gdf.crs) if gdf.crs else None

            source_epsg_str = None
            try:
                epsg = gdf.crs.to_epsg() if gdf.crs else None
                if epsg:
                    source_epsg_str = f"EPSG:{int(epsg)}"
            except Exception:
                source_epsg_str = None

            try:
                out_gdf = gdf.to_crs("EPSG:4326")
            except Exception as exc:
                return _json_error(f"Falha ao reprojetar para EPSG:4326: {_safe_error(exc)}")

            try:
                bbox = [float(x) for x in out_gdf.total_bounds]
            except Exception:
                bbox = None

            safe_gdf = _sanitize_gdf_for_geojson(out_gdf)
            geojson_dict = _gdf_to_geojson_dict(safe_gdf)
            if not geojson_dict:
                return _json_error("Falha ao gerar GeoJSON")

            return JsonResponse(
                {
                    "name": layer_title,
                    "format": fmt,
                    "sourceCrs": source_crs_str,
                    "sourceEpsg": source_epsg_str,
                    "outputCrs": "EPSG:4326",
                    "featureCount": int(len(out_gdf.index)),
                    "bbox": bbox,
                    "geojson": geojson_dict,
                }
            )

    except ValueError as exc:
        return _json_error(str(exc), status=400)
    except Exception as exc:
        return _json_error(_safe_error(exc), status=500)

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
import re

import requests
from django.conf import settings


@dataclass(frozen=True)
class GeoServerConfig:
    base_url: str
    user: str
    password: str

    @property
    def rest_base(self) -> str:
        return self.base_url.rstrip("/") + "/rest"


class GeoServerError(RuntimeError):
    pass


_SAFE_FIELD_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_EPSG_RE = re.compile(r"(?i)(?:EPSG(?::|::)|epsg/|EPSG/0/)(\d{3,6})")


def _infer_type_group_from_binding(binding: str | None) -> str:
    t = (binding or "").lower()
    if re.search(r"(date|time|timestamp)", t):
        return "date"
    if re.search(r"(int|integer|long|double|float|decimal|number|short)", t):
        return "number"
    return "string"


def _resolve_field_name_and_type(workspace: str, layer_name: str, field: str) -> tuple[str, str]:
    """Resolve the exact attribute name (case-sensitive) and its type group.

    Many datasets expose attributes with upper-case names (e.g. OBJECTID) while
    the UI may send lower-case (objectid). GeoServer WFS can error when
    propertyName references a non-existent attribute.
    """
    attrs = get_layer_attributes(workspace, layer_name) or []
    wanted = field.lower()

    for a in attrs:
        name = (a or {}).get("name")
        if not isinstance(name, str) or not name:
            continue
        if name.lower() == wanted:
            binding = (a or {}).get("type")
            binding_str = binding if isinstance(binding, str) else None
            return name, _infer_type_group_from_binding(binding_str)

    raise GeoServerError("Invalid field")


def _extract_epsg(value: Any) -> str | None:
    if not value:
        return None
    if isinstance(value, dict):
        # Try common nesting patterns
        for k in ("name", "crs", "srs", "srsName", "code"):
            v = value.get(k)
            got = _extract_epsg(v)
            if got:
                return got
        return None

    s = str(value)
    m = _EPSG_RE.search(s)
    if not m:
        return None
    return f"EPSG:{m.group(1)}"


def _get_config() -> GeoServerConfig:
    base_url = getattr(settings, "GEOSERVER_BASE_URL", "")
    user = getattr(settings, "GEOSERVER_USER", "")
    password = getattr(settings, "GEOSERVER_PASSWORD", "")

    if not base_url or not user:
        raise GeoServerError("GeoServer credentials not configured (GEOSERVER_BASE_URL/GEOSERVER_USER).")

    return GeoServerConfig(base_url=base_url, user=user, password=password or "")


def _fetch_json(url: str) -> Any:
    cfg = _get_config()
    try:
        resp = requests.get(url, auth=(cfg.user, cfg.password), timeout=20)
    except requests.RequestException as exc:
        raise GeoServerError(str(exc)) from exc

    if resp.status_code >= 400:
        raise GeoServerError(f"GeoServer error {resp.status_code}: {resp.text[:500]}")

    try:
        return resp.json()
    except ValueError as exc:
        raise GeoServerError("Invalid JSON returned by GeoServer") from exc


def list_workspaces() -> list[str]:
    cfg = _get_config()
    data = _fetch_json(cfg.rest_base + "/workspaces.json")
    workspaces = (((data or {}).get("workspaces") or {}).get("workspace")) or []

    names: list[str] = []
    for item in workspaces:
        name = (item or {}).get("name")
        if name:
            names.append(name)

    return sorted(set(names))


def list_layers_in_workspace(workspace: str, service_type: str) -> list[dict[str, str]]:
    cfg = _get_config()

    # Normaliza service_type (apenas para validação básica, mas usaremos estratégia genérica)
    service_type = (service_type or "").upper()
    
    layer_names: set[str] = set()

    # Estratégia 1: /workspaces/{workspace}/layers.json
    # Lista todas as camadas publicadas (WMS e WFS) no workspace.
    try:
        data = _fetch_json(cfg.rest_base + f"/workspaces/{workspace}/layers.json")
        layers = (((data or {}).get("layers") or {}).get("layer")) or []
        for layer in layers:
            name = (layer or {}).get("name")
            if not name:
                continue
            if ":" in name:
                ws, lname = name.split(":", 1)
                if ws == workspace and lname:
                    layer_names.add(lname)
            else:
                layer_names.add(name)
    except GeoServerError:
        pass

    # Estratégia 2: /layers.json (global) e filtrar por prefixo
    # Útil se o endpoint de workspace falhar ou não estiver acessível
    if not layer_names:
        try:
            data = _fetch_json(cfg.rest_base + "/layers.json")
            layers = (((data or {}).get("layers") or {}).get("layer")) or []
            for layer in layers:
                name = (layer or {}).get("name")
                if not name or ":" not in name:
                    continue
                ws, lname = name.split(":", 1)
                if ws == workspace and lname:
                    layer_names.add(lname)
        except GeoServerError:
            pass

    # Estratégia 3: /workspaces/{workspace}/featuretypes.json (apenas se WFS)
    # Tenta buscar FeatureTypes diretamente se ainda não achou nada
    if not layer_names and service_type == "WFS":
        try:
            ft_data = _fetch_json(cfg.rest_base + f"/workspaces/{workspace}/featuretypes.json")
            fts = (((ft_data or {}).get("featureTypes") or {}).get("featureType")) or []
            for ft in fts:
                name = (ft or {}).get("name")
                if name:
                    layer_names.add(name)
        except GeoServerError:
            pass

    return [
        {"name": n, "qualifiedName": f"{workspace}:{n}", "workspace": workspace}
        for n in sorted(layer_names)
    ]


def _list_wfs_featuretypes(cfg: GeoServerConfig, workspace: str) -> list[dict[str, str]]:
    # Deprecated: merged into list_layers_in_workspace
    return []


def _list_wms_layers(cfg: GeoServerConfig, workspace: str) -> list[dict[str, str]]:
    # Deprecated: merged into list_layers_in_workspace
    return []


def get_layer_attributes(workspace: str, layer_name: str) -> list[dict[str, str]]:
    """
    Fetches attributes (fields) for a given layer (FeatureType) from GeoServer.
    Returns a list of dicts with 'name' and 'type'.
    """
    cfg = _get_config()
    
    # 1. Get Layer info to find the resource (FeatureType) URL
    try:
        layer_url = f"{cfg.rest_base}/workspaces/{workspace}/layers/{layer_name}.json"
        layer_data = _fetch_json(layer_url)
        resource_href = layer_data.get("layer", {}).get("resource", {}).get("href")
        
        if not resource_href:
            return []
            
        # Fix protocol if needed (e.g. http vs https mismatch in internal vs external url)
        # But usually requests handles redirects or we just use the path if it's relative? 
        # GeoServer usually returns full URL. We might need to replace base URL if it differs from configured.
        # For simplicity, let's try to use the href but replace the base if it looks different, 
        # or just construct the path if we can parse it.
        # Safer: extract the path after /rest/ and append to our cfg.rest_base
        
        if "/rest/" in resource_href:
            suffix = resource_href.split("/rest/", 1)[1]
            resource_url = f"{cfg.rest_base}/{suffix}"
        else:
            resource_url = resource_href

        # 2. Get Resource (FeatureType) info
        ft_data = _fetch_json(resource_url)
        
        # Handle FeatureType
        feature_type = ft_data.get("featureType")
        if feature_type:
            attributes = feature_type.get("attributes", {}).get("attribute", [])
            return [
                {"name": attr.get("name"), "type": attr.get("binding")}
                for attr in attributes
                if attr.get("name")
            ]
            
        # Handle Coverage (Raster) - usually doesn't have attributes in the same way
        # but might have dimensions etc. For now, return empty for coverages.
        return []

    except Exception:
        # If anything fails (layer not found, etc), return empty list
        return []


def get_layer_native_crs(workspace: str, layer_name: str) -> str | None:
    """Fetches the native CRS for a layer from GeoServer REST.

    Returns an EPSG code like "EPSG:10665" when available.
    """
    cfg = _get_config()

    layer_url = f"{cfg.rest_base}/workspaces/{workspace}/layers/{layer_name}.json"
    layer_data = _fetch_json(layer_url)
    resource_href = (layer_data or {}).get("layer", {}).get("resource", {}).get("href")
    if not resource_href:
        return None

    if "/rest/" in resource_href:
        suffix = resource_href.split("/rest/", 1)[1]
        resource_url = f"{cfg.rest_base}/{suffix}"
    else:
        resource_url = resource_href

    res = _fetch_json(resource_url)
    ft = (res or {}).get("featureType")
    cov = (res or {}).get("coverage")

    # Prefer the explicit 'srs' field.
    if ft:
        return _extract_epsg(ft.get("srs")) or _extract_epsg(ft.get("nativeCRS")) or _extract_epsg(
            ((ft.get("nativeBoundingBox") or {}) if isinstance(ft.get("nativeBoundingBox"), dict) else {})
        )

    if cov:
        return _extract_epsg(cov.get("srs")) or _extract_epsg(cov.get("nativeCRS")) or _extract_epsg(
            ((cov.get("nativeBoundingBox") or {}) if isinstance(cov.get("nativeBoundingBox"), dict) else {})
        )

    # Last resort: scan the whole JSON for an EPSG code.
    return _extract_epsg(res)


def get_layer_bboxes(workspace: str, layer_name: str) -> dict[str, Any] | None:
    """Fetches native and lat/lon bounding boxes for a layer from GeoServer REST.

    Returns a dict like:
    {
      "native": {"crs": "EPSG:10665", "extent": [minx, miny, maxx, maxy]},
      "latLon": {"crs": "EPSG:4326", "extent": [minx, miny, maxx, maxy]}
    }
    when available.
    """
    cfg = _get_config()

    layer_url = f"{cfg.rest_base}/workspaces/{workspace}/layers/{layer_name}.json"
    layer_data = _fetch_json(layer_url)
    resource_href = (layer_data or {}).get("layer", {}).get("resource", {}).get("href")
    if not resource_href:
        return None

    if "/rest/" in resource_href:
        suffix = resource_href.split("/rest/", 1)[1]
        resource_url = f"{cfg.rest_base}/{suffix}"
    else:
        resource_url = resource_href

    res = _fetch_json(resource_url)
    ft = (res or {}).get("featureType")
    cov = (res or {}).get("coverage")
    obj = ft or cov
    if not isinstance(obj, dict):
        return None

    def _bbox_to_extent(b: Any) -> tuple[list[float], str | None] | None:
        if not isinstance(b, dict):
            return None
        try:
            minx = float(b.get("minx"))
            miny = float(b.get("miny"))
            maxx = float(b.get("maxx"))
            maxy = float(b.get("maxy"))
        except Exception:
            return None
        crs = _extract_epsg(b.get("crs") or b.get("srs") or b.get("srsName") or b.get("name"))
        return ([minx, miny, maxx, maxy], crs)

    native_box = _bbox_to_extent(obj.get("nativeBoundingBox"))
    latlon_box = _bbox_to_extent(obj.get("latLonBoundingBox"))

    out: dict[str, Any] = {}
    if native_box:
        extent, crs = native_box
        out["native"] = {"crs": crs or _extract_epsg(obj.get("srs")) or _extract_epsg(obj.get("nativeCRS")), "extent": extent}
    if latlon_box:
        extent, crs = latlon_box
        out["latLon"] = {"crs": crs or "EPSG:4326", "extent": extent}

    return out or None


def suggest_layer_field_values(
    workspace: str,
    layer_name: str,
    field: str,
    q: str | None = None,
    limit: int = 10,
    max_fetch: int = 200,
) -> list[str]:
    """Fetch value suggestions for a given field from a WFS layer.

    Notes:
    - Uses GeoServer WFS GetFeature (outputFormat=application/json)
    - Applies a simple ILIKE contains filter when q is provided
    - De-duplicates client-side (WFS doesn't guarantee DISTINCT)
    """
    if not field or not _SAFE_FIELD_RE.match(field):
        raise GeoServerError("Invalid field")

    # Resolve real field name (case-sensitive) and type.
    field, field_type = _resolve_field_name_and_type(workspace, layer_name, field)

    cfg = _get_config()
    base = cfg.base_url.rstrip("/")
    wfs_url = base + "/wfs"

    limit = max(1, min(int(limit or 10), 50))
    max_fetch = max(limit, min(int(max_fetch or 200), 1000))

    cql = None
    if q is not None:
        q = (q or "").strip()
    if q and field_type == "string":
        # Escape single quotes for CQL string literal
        q_esc = q.replace("'", "''")
        cql = f"{field} ILIKE '%{q_esc}%'"

    params = {
        "service": "WFS",
        "version": "2.0.0",
        "request": "GetFeature",
        "typeNames": f"{workspace}:{layer_name}",
        "outputFormat": "application/json",
        "propertyName": field,
        "count": str(max_fetch),
    }
    if cql:
        params["cql_filter"] = cql

    def _do_request(with_cql: bool) -> requests.Response:
        p = dict(params)
        if with_cql and cql:
            p["cql_filter"] = cql
        try:
            return requests.get(wfs_url, params=p, auth=(cfg.user, cfg.password), timeout=20)
        except requests.RequestException as exc:
            raise GeoServerError(str(exc)) from exc

    # First try with CQL (best performance) when we have a string filter.
    # For number/date fields we avoid CQL here and filter client-side.
    resp = _do_request(with_cql=True)
    if resp.status_code >= 400:
        body = (resp.text or "")[:500]
        if cql:
            # Retry without cql_filter.
            resp2 = _do_request(with_cql=False)
            if resp2.status_code < 400:
                resp = resp2
            else:
                raise GeoServerError(f"GeoServer error {resp.status_code}: {body}")
        else:
            raise GeoServerError(f"GeoServer error {resp.status_code}: {body}")

    try:
        data = resp.json()
    except ValueError as exc:
        raise GeoServerError("Invalid JSON returned by GeoServer") from exc

    features = (data or {}).get("features") or []
    seen: set[str] = set()
    out: list[str] = []
    for f in features:
        props = (f or {}).get("properties") or {}
        if field not in props:
            continue
        v = props.get(field)
        if v is None:
            continue
        s = str(v).strip()
        if not s:
            continue
        if q and q.lower() not in s.lower():
            continue
        if s in seen:
            continue
        seen.add(s)
        out.append(s)
        if len(out) >= limit:
            break

    return out


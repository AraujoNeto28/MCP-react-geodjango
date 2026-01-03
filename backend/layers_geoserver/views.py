import json

from django.http import HttpResponseNotAllowed, JsonResponse
from django.shortcuts import get_object_or_404
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


def _json_error(message: str, status: int = 400):
    return JsonResponse({"error": message}, status=status)


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
        "order": rg.order,
    }


def _serialize_thematic_group(g: ThematicGroup):
    return {
        "id": g.id,
        "rootGroupId": g.root_group_id,
        "title": g.title,
        "visible": g.visible,
        "order": g.order,
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
        "order": layer.order,
        "geometryType": layer.geometry_type,
        "minZoom": layer.min_zoom,
        "queryable": layer.queryable,
        "queryableFields": layer.queryable_fields,
        "tableFields": layer.table_fields,
        "filter": layer.filter,
        "popupTemplate": layer.popup_template,
        "styleConfig": layer.style_config,
    }


@csrf_exempt
def layers_tree(request):
    if request.method != "GET":
        return HttpResponseNotAllowed(["GET"])

    roots = RootGroup.objects.all().order_by("order", "title")
    result = []

    for rg in roots:
        thematic_groups = rg.thematic_groups.all().order_by("order", "title")
        direct_layers = rg.layers.filter(thematic_group__isnull=True).order_by("order", "title")

        result.append(
            {
                **_serialize_root_group(rg),
                "layers": [_serialize_layer(l) for l in direct_layers],
                "thematicGroups": [
                    {
                        **_serialize_thematic_group(g),
                        "layers": [_serialize_layer(l) for l in g.layers.all().order_by("order", "title")],
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
        roots = RootGroup.objects.all().order_by("order", "title")
        return JsonResponse([_serialize_root_group(r) for r in roots], safe=False)

    if request.method == "POST":
        data = _parse_json_body(request)
        if data is None:
            return _json_error("Invalid JSON")

        required = ["id", "title", "serviceType", "workspace"]
        missing = [k for k in required if k not in data]
        if missing:
            return _json_error(f"Missing fields: {', '.join(missing)}")

        rg = RootGroup(
            id=data["id"],
            title=data["title"],
            service_type=data["serviceType"],
            workspace=data["workspace"],
            visible=bool(data.get("visible", True)),
            order=int(data.get("order", 0)),
        )
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
            "order": "order",
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
        groups = ThematicGroup.objects.select_related("root_group").all().order_by("root_group_id", "order", "title")
        return JsonResponse([_serialize_thematic_group(g) for g in groups], safe=False)

    if request.method == "POST":
        data = _parse_json_body(request)
        if data is None:
            return _json_error("Invalid JSON")

        required = ["id", "rootGroupId", "title"]
        missing = [k for k in required if k not in data]
        if missing:
            return _json_error(f"Missing fields: {', '.join(missing)}")

        root = get_object_or_404(RootGroup, pk=data["rootGroupId"])
        g = ThematicGroup(
            id=data["id"],
            root_group=root,
            title=data["title"],
            visible=bool(data.get("visible", True)),
            order=int(data.get("order", 0)),
        )
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

        mapping = {"title": "title", "visible": "visible", "order": "order"}
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
            "root_group_id", "thematic_group_id", "order", "title"
        )
        return JsonResponse([_serialize_layer(l) for l in layers], safe=False)

    if request.method == "POST":
        data = _parse_json_body(request)
        if data is None:
            return _json_error("Invalid JSON")

        required = ["id", "rootGroupId", "title", "layerName", "geometryType"]
        missing = [k for k in required if k not in data]
        if missing:
            return _json_error(f"Missing fields: {', '.join(missing)}")

        root = get_object_or_404(RootGroup, pk=data["rootGroupId"])
        thematic = None
        if data.get("thematicGroupId"):
            thematic = get_object_or_404(ThematicGroup, pk=data["thematicGroupId"])

        layer = Layer(
            id=data["id"],
            root_group=root,
            thematic_group=thematic,
            title=data["title"],
            layer_name=data["layerName"],
            workspace=root.workspace,
            service_type=root.service_type,
            native_crs=data.get("nativeCrs"),
            visible=bool(data.get("visible", True)),
            order=int(data.get("order", 0)),
            geometry_type=data["geometryType"],
            min_zoom=data.get("minZoom"),
            queryable=bool(data.get("queryable", False)),
            queryable_fields=data.get("queryableFields") or [],
            table_fields=data.get("tableFields") or [],
            filter=data.get("filter"),
            popup_template=data.get("popupTemplate"),
            style_config=data.get("styleConfig"),
        )

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
            "order": "order",
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

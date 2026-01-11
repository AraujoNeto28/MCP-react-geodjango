import json
import logging
import re
from django.contrib import admin, messages
from django.core.serializers.json import DjangoJSONEncoder
from django.http import HttpResponse
from django.shortcuts import render, redirect
from django.urls import path
from django.db import transaction


from .models import Layer, RootGroup, ThematicGroup


_SLUG_SAFE_RE = re.compile(r"[^a-zA-Z0-9_-]+")


def _json_compact(value) -> str:
    return json.dumps(value, cls=DjangoJSONEncoder, ensure_ascii=False, sort_keys=True)


def _clip(s: str, limit: int = 1200) -> str:
    if len(s) <= limit:
        return s
    return s[:limit] + "…(truncado)"


def _diff_named_dict_list(old_value, new_value, key_name: str = "name") -> str | None:
    """Human diff for list[dict] where dict has a unique key (default: 'name')."""
    if not isinstance(old_value, list) or not isinstance(new_value, list):
        return None
    old_map = {
        d.get(key_name): d
        for d in old_value
        if isinstance(d, dict) and isinstance(d.get(key_name), str)
    }
    new_map = {
        d.get(key_name): d
        for d in new_value
        if isinstance(d, dict) and isinstance(d.get(key_name), str)
    }
    if not old_map and not new_map:
        return None

    old_keys = set(old_map.keys())
    new_keys = set(new_map.keys())
    removed = sorted(old_keys - new_keys)
    added = sorted(new_keys - old_keys)
    common = sorted(old_keys & new_keys)
    changed = [k for k in common if old_map.get(k) != new_map.get(k)]

    parts: list[str] = []
    if removed:
        parts.append(f"removidos={removed}")
    if added:
        parts.append(f"adicionados={added}")
    if changed:
        parts.append(f"alterados={changed}")
    return "; ".join(parts) if parts else None


def _format_before_after(old_value, new_value) -> str:
    # Prefer stable JSON for collections
    if isinstance(old_value, (dict, list)) or isinstance(new_value, (dict, list)):
        return f"{_clip(_json_compact(old_value))} -> {_clip(_json_compact(new_value))}"
    return f"{old_value!s} -> {new_value!s}"


@admin.register(RootGroup)
class RootGroupAdmin(admin.ModelAdmin):
    change_list_template = "admin/layers_geoserver/rootgroup/change_list.html"
    list_display = ("id", "title", "service_type", "workspace", "visible", "open_builder")
    list_filter = ("service_type", "visible")
    search_fields = ("id", "title", "workspace")
    ordering = ("title",)
    actions = ["export_as_json"]

    def open_builder(self, obj):
        from django.utils.html import format_html
        from django.urls import reverse
        url = reverse('tree_builder')
        return format_html('<a class="button" href="{}?id={}" target="_blank">Abrir no Editor</a>', url, obj.id)
    
    open_builder.short_description = "Editor"
    open_builder.allow_tags = True

    class Media:
        js = ("layers_geoserver/js/geoserver_admin.js",)

    def get_urls(self):
        urls = super().get_urls()
        my_urls = [
            path('import-json/', self.admin_site.admin_view(self.import_json), name='import_json'),
        ]
        return my_urls + urls

    def import_json(self, request):
        if request.method == "POST":
            json_file = request.FILES["json_file"]
            try:
                data = json.load(json_file)
                # Ensure data is a list
                if not isinstance(data, list):
                    data = [data]

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
                            seen_root_ids.add(root_id)
                        else:
                            root_group = RootGroup(**root_defaults)
                            root_group.save()
                        
                        # Process Root Layers
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
                                "queryable": layer_data.get("queryable", False),
                                "queryable_fields": layer_data.get("queryable_fields") or [],
                                "table_fields": layer_data.get("table_fields") or [],
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
                                    "queryable": layer_data.get("queryable", False),
                                    "queryable_fields": layer_data.get("queryable_fields") or [],
                                    "table_fields": layer_data.get("table_fields") or [],
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

                self.message_user(request, "Importação realizada com sucesso!")
                return redirect("admin:layers_geoserver_rootgroup_changelist")
            except Exception as e:
                self.message_user(request, f"Erro ao importar JSON: {str(e)}", level=messages.ERROR)

        context = dict(
           self.admin_site.each_context(request),
        )
        return render(request, "admin/layers_geoserver/rootgroup/import_json.html", context)

    @admin.action(description="Exportar selecionados como JSON")
    def export_as_json(self, request, queryset):
        data = []
        for root in queryset.order_by("title"):
            root_data = {
                "id": root.id,
                "title": root.title,
                "service_type": root.service_type,
                "workspace": root.workspace,
                "visible": root.visible,
                "layers": [],
                "thematic_groups": [],
            }

            # Layers directly under root
            root_layers = root.layers.filter(thematic_group__isnull=True).order_by("title")
            for layer in root_layers:
                root_data["layers"].append({
                    "id": layer.id,
                    "title": layer.title,
                    "layer_name": layer.layer_name,
                    "workspace": layer.workspace,
                    "service_type": layer.service_type,
                    "native_crs": layer.native_crs,
                    "visible": layer.visible,
                    "geometry_type": layer.geometry_type,
                    "min_zoom": layer.min_zoom,
                    "queryable": layer.queryable,
                    "queryable_fields": layer.queryable_fields,
                    "table_fields": layer.table_fields,
                    "filter": layer.filter,
                    "popup_template": layer.popup_template,
                    "style_config": layer.style_config,
                })

            # Thematic groups
            groups = root.thematic_groups.all().order_by("title")
            for group in groups:
                group_data = {
                    "id": group.id,
                    "title": group.title,
                    "visible": group.visible,
                    "layers": [],
                }
                
                group_layers = group.layers.all().order_by("title")
                for layer in group_layers:
                    group_data["layers"].append({
                        "id": layer.id,
                        "title": layer.title,
                        "layer_name": layer.layer_name,
                        "workspace": layer.workspace,
                        "service_type": layer.service_type,
                        "native_crs": layer.native_crs,
                        "visible": layer.visible,
                        "geometry_type": layer.geometry_type,
                        "min_zoom": layer.min_zoom,
                        "queryable": layer.queryable,
                        "queryable_fields": layer.queryable_fields,
                        "table_fields": layer.table_fields,
                        "filter": layer.filter,
                        "popup_template": layer.popup_template,
                        "style_config": layer.style_config,
                    })
                
                root_data["thematic_groups"].append(group_data)
            
            data.append(root_data)

        response = HttpResponse(
            json.dumps(data, cls=DjangoJSONEncoder, indent=2, ensure_ascii=False),
            content_type="application/json"
        )
        response["Content-Disposition"] = 'attachment; filename="root_groups_export.json"'
        return response



@admin.register(ThematicGroup)
class ThematicGroupAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "root_group", "visible")
    list_filter = ("visible", "root_group")
    search_fields = ("id", "title")
    ordering = ("root_group", "title")


@admin.register(Layer)
class LayerAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "root_group", "thematic_group", "layer_name", "native_crs", "visible")
    list_filter = ("root_group", "service_type", "geometry_type", "visible")
    search_fields = ("id", "title", "layer_name")
    ordering = ("root_group", "thematic_group", "title")

    class Media:
        css = {
            "all": (
                "https://cdn.jsdelivr.net/npm/ol@10.7.0/ol.css",
            )
        }
        js = (
            "https://cdn.jsdelivr.net/npm/ol@10.7.0/dist/ol.js",
            "layers_geoserver/js/geoserver_admin.js",
        )

    def save_model(self, request, obj, form, change):
        # Capture a field-level diff for Admin history.
        audit_lines: list[str] = []
        changed_fields = list(getattr(form, "changed_data", []) or [])

        if change and obj.pk and changed_fields:
            try:
                old_obj = self.model.objects.get(pk=obj.pk)
            except self.model.DoesNotExist:
                old_obj = None

            if old_obj is not None:
                for field_name in changed_fields:
                    try:
                        field = self.model._meta.get_field(field_name)
                    except Exception:
                        field = None

                    # FK fields: show human readable values
                    if field is not None and getattr(field, "many_to_one", False):
                        old_display = str(getattr(old_obj, field_name, ""))
                        new_display = str(getattr(obj, field_name, ""))
                        audit_lines.append(f"{field_name}: {old_display} -> {new_display}")
                        continue

                    old_value = getattr(old_obj, field_name, None)
                    new_value = getattr(obj, field_name, None)

                    if field_name in {"queryable_fields", "table_fields"}:
                        d = _diff_named_dict_list(old_value, new_value, key_name="name")
                        if d:
                            audit_lines.append(f"{field_name}: {d}")
                        else:
                            audit_lines.append(f"{field_name}: {_format_before_after(old_value, new_value)}")
                        continue

                    audit_lines.append(f"{field_name}: {_format_before_after(old_value, new_value)}")

        # Stash for log_change
        request._audit_layer_diff_lines = audit_lines
        request._audit_layer_changed_fields = changed_fields
        super().save_model(request, obj, form, change)

    def log_change(self, request, object, message):
        # Force a string change_message that includes before/after values.
        lines = getattr(request, "_audit_layer_diff_lines", None) or []
        fields = getattr(request, "_audit_layer_changed_fields", None) or []
        if lines:
            summary = f"Campos alterados: {', '.join(fields)}"
            # Admin UI collapses newlines in history; keep it single-line.
            message = summary + " | " + " | ".join(lines)
            logging.getLogger("mcp.audit").info(
                "Layer %s alterado. %s",
                getattr(object, "pk", ""),
                message,
            )
        return super().log_change(request, object, message)

    def delete_model(self, request, obj):
        logging.getLogger("mcp.audit").info(
            "Layer %s deletado.",
            getattr(obj, "pk", ""),
        )
        return super().delete_model(request, obj)

    def delete_queryset(self, request, queryset):
        pks = list(queryset.values_list("pk", flat=True)[:50])
        count = queryset.count()
        logging.getLogger("mcp.audit").info(
            "Layers deletadas (bulk). total=%s ids=%s%s",
            count,
            pks,
            "" if count <= len(pks) else "…",
        )
        return super().delete_queryset(request, queryset)

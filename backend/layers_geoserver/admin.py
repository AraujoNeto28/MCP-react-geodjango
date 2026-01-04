import json
from django.contrib import admin, messages
from django.http import HttpResponse
from django.shortcuts import render, redirect
from django.urls import path
from django.db import transaction
from django.core.serializers.json import DjangoJSONEncoder

from .models import Layer, RootGroup, ThematicGroup


@admin.register(RootGroup)
class RootGroupAdmin(admin.ModelAdmin):
    change_list_template = "admin/layers_geoserver/rootgroup/change_list.html"
    list_display = ("id", "title", "service_type", "workspace", "visible", "order", "open_builder")
    list_filter = ("service_type", "visible")
    search_fields = ("id", "title", "workspace")
    ordering = ("order", "title")
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
                    for root_data in data:
                        # Create or Update RootGroup
                        root_group, created = RootGroup.objects.update_or_create(
                            id=root_data["id"],
                            defaults={
                                "title": root_data["title"],
                                "service_type": root_data["service_type"],
                                "workspace": root_data["workspace"],
                                "visible": root_data["visible"],
                                "order": root_data["order"],
                            }
                        )
                        
                        # Process Root Layers
                        for layer_data in root_data.get("layers", []):
                            layer_id = layer_data.get("id")
                            if not layer_id:
                                layer_id = f"{root_group.id}_{layer_data['layer_name']}_{layer_data['order']}"
                            
                            Layer.objects.update_or_create(
                                id=layer_id,
                                defaults={
                                    "title": layer_data["title"],
                                    "layer_name": layer_data["layer_name"],
                                    "workspace": layer_data["workspace"],
                                    "service_type": layer_data["service_type"],
                                    "native_crs": layer_data.get("native_crs"),
                                    "visible": layer_data["visible"],
                                    "order": layer_data["order"],
                                    "geometry_type": layer_data["geometry_type"],
                                    "min_zoom": layer_data.get("min_zoom"),
                                    "queryable": layer_data["queryable"],
                                    "queryable_fields": layer_data.get("queryable_fields"),
                                    "table_fields": layer_data.get("table_fields"),
                                    "filter": layer_data.get("filter"),
                                    "popup_template": layer_data.get("popup_template"),
                                    "style_config": layer_data.get("style_config"),
                                    "root_group": root_group,
                                    "thematic_group": None
                                }
                            )

                        # Process Thematic Groups
                        for group_data in root_data.get("thematic_groups", []):
                            thematic_group, _ = ThematicGroup.objects.update_or_create(
                                id=group_data["id"],
                                defaults={
                                    "title": group_data["title"],
                                    "visible": group_data["visible"],
                                    "order": group_data["order"],
                                    "root_group": root_group
                                }
                            )

                            for layer_data in group_data.get("layers", []):
                                layer_id = layer_data.get("id")
                                if not layer_id:
                                    layer_id = f"{thematic_group.id}_{layer_data['layer_name']}_{layer_data['order']}"

                                Layer.objects.update_or_create(
                                    id=layer_id,
                                    defaults={
                                        "title": layer_data["title"],
                                        "layer_name": layer_data["layer_name"],
                                        "workspace": layer_data["workspace"],
                                        "service_type": layer_data["service_type"],
                                        "native_crs": layer_data.get("native_crs"),
                                        "visible": layer_data["visible"],
                                        "order": layer_data["order"],
                                        "geometry_type": layer_data["geometry_type"],
                                        "min_zoom": layer_data.get("min_zoom"),
                                        "queryable": layer_data["queryable"],
                                        "queryable_fields": layer_data.get("queryable_fields"),
                                        "table_fields": layer_data.get("table_fields"),
                                        "filter": layer_data.get("filter"),
                                        "popup_template": layer_data.get("popup_template"),
                                        "style_config": layer_data.get("style_config"),
                                        "root_group": root_group,
                                        "thematic_group": thematic_group
                                    }
                                )

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
        for root in queryset.order_by("order"):
            root_data = {
                "id": root.id,
                "title": root.title,
                "service_type": root.service_type,
                "workspace": root.workspace,
                "visible": root.visible,
                "order": root.order,
                "layers": [],
                "thematic_groups": [],
            }

            # Layers directly under root
            root_layers = root.layers.filter(thematic_group__isnull=True).order_by("order")
            for layer in root_layers:
                root_data["layers"].append({
                    "id": layer.id,
                    "title": layer.title,
                    "layer_name": layer.layer_name,
                    "workspace": layer.workspace,
                    "service_type": layer.service_type,
                    "native_crs": layer.native_crs,
                    "visible": layer.visible,
                    "order": layer.order,
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
            groups = root.thematic_groups.all().order_by("order")
            for group in groups:
                group_data = {
                    "id": group.id,
                    "title": group.title,
                    "visible": group.visible,
                    "order": group.order,
                    "layers": [],
                }
                
                group_layers = group.layers.all().order_by("order")
                for layer in group_layers:
                    group_data["layers"].append({
                        "id": layer.id,
                        "title": layer.title,
                        "layer_name": layer.layer_name,
                        "workspace": layer.workspace,
                        "service_type": layer.service_type,
                        "native_crs": layer.native_crs,
                        "visible": layer.visible,
                        "order": layer.order,
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
    list_display = ("id", "title", "root_group", "visible", "order")
    list_filter = ("visible", "root_group")
    search_fields = ("id", "title")
    ordering = ("root_group", "order", "title")


@admin.register(Layer)
class LayerAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "root_group", "thematic_group", "layer_name", "native_crs", "visible", "order")
    list_filter = ("root_group", "service_type", "geometry_type", "visible")
    search_fields = ("id", "title", "layer_name")
    ordering = ("root_group", "thematic_group", "order", "title")

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

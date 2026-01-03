from django.contrib import admin

from .models import Layer, RootGroup, ThematicGroup


@admin.register(RootGroup)
class RootGroupAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "service_type", "workspace", "visible", "order")
    list_filter = ("service_type", "visible")
    search_fields = ("id", "title", "workspace")
    ordering = ("order", "title")

    class Media:
        js = ("layers_geoserver/js/geoserver_admin.js",)


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

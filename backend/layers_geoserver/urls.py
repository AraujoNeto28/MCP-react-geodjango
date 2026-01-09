from django.urls import path

from . import views

urlpatterns = [
    path("tree-builder/", views.tree_builder_view, name="tree_builder"),
    path("layers/tree/save/", views.save_tree, name="save_tree"),
    path("layers/tree/", views.layers_tree, name="layers_tree"),
    path("layers/root-groups/", views.root_groups_collection, name="root_groups_collection"),
    path("layers/root-groups/<slug:root_group_id>/", views.root_group_detail, name="root_group_detail"),
    path("layers/thematic-groups/", views.thematic_groups_collection, name="thematic_groups_collection"),
    path(
        "layers/thematic-groups/<slug:thematic_group_id>/",
        views.thematic_group_detail,
        name="thematic_group_detail",
    ),
    path("layers/layers/", views.layers_collection, name="layers_collection"),
    path("layers/layers/<slug:layer_id>/", views.layer_detail, name="layer_detail"),
    path("geoserver/workspaces/", views.geoserver_workspaces, name="geoserver_workspaces"),
    path(
        "geoserver/workspaces/<str:workspace>/layers/",
        views.geoserver_workspace_layers,
        name="geoserver_workspace_layers",
    ),
    path(
        "geoserver/workspaces/<str:workspace>/layers/<str:layer_name>/attributes/",
        views.geoserver_layer_attributes,
        name="geoserver_layer_attributes",
    ),
    path(
        "geoserver/workspaces/<str:workspace>/layers/<str:layer_name>/native-crs/",
        views.geoserver_layer_native_crs,
        name="geoserver_layer_native_crs",
    ),
    path(
        "geoserver/workspaces/<str:workspace>/layers/<str:layer_name>/bbox/",
        views.geoserver_layer_bbox,
        name="geoserver_layer_bbox",
    ),
    path(
        "geoserver/workspaces/<str:workspace>/layers/<str:layer_name>/suggest/",
        views.geoserver_layer_suggest,
        name="geoserver_layer_suggest",
    ),
    path("layers/upload/", views.upload_user_layer, name="upload_user_layer"),
]

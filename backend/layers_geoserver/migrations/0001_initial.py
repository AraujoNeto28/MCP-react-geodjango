from django.db import migrations, models
import django.db.models.deletion

import layers_geoserver.models


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="RootGroup",
            fields=[
                (
                    "id",
                    models.SlugField(
                        default=layers_geoserver.models.generate_rootgroup_id,
                        max_length=128,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("title", models.CharField(max_length=255)),
                (
                    "service_type",
                    models.CharField(choices=[("WFS", "WFS"), ("WMS", "WMS")], max_length=3),
                ),
                ("workspace", models.CharField(max_length=255)),
                ("visible", models.BooleanField(default=True)),
            ],
            options={"ordering": ["title"]},
        ),
        migrations.CreateModel(
            name="ThematicGroup",
            fields=[
                (
                    "id",
                    models.SlugField(
                        default=layers_geoserver.models.generate_thematicgroup_id,
                        max_length=128,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("title", models.CharField(max_length=255)),
                ("visible", models.BooleanField(default=True)),
                (
                    "root_group",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="thematic_groups",
                        to="layers_geoserver.rootgroup",
                    ),
                ),
            ],
            options={"ordering": ["title"]},
        ),
        migrations.CreateModel(
            name="Layer",
            fields=[
                (
                    "id",
                    models.SlugField(
                        default=layers_geoserver.models.generate_layer_id,
                        max_length=128,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("title", models.CharField(max_length=255)),
                ("layer_name", models.CharField(max_length=255)),
                ("workspace", models.CharField(max_length=255)),
                (
                    "service_type",
                    models.CharField(choices=[("WFS", "WFS"), ("WMS", "WMS")], max_length=3),
                ),
                ("native_crs", models.CharField(blank=True, max_length=32, null=True)),
                ("visible", models.BooleanField(default=True)),
                (
                    "geometry_type",
                    models.CharField(
                        choices=[("Point", "Point"), ("LineString", "LineString"), ("Polygon", "Polygon")],
                        max_length=16,
                    ),
                ),
                ("min_zoom", models.IntegerField(blank=True, null=True)),
                ("queryable", models.BooleanField(default=False)),
                ("queryable_fields", models.JSONField(blank=True, default=list)),
                ("table_fields", models.JSONField(blank=True, default=list)),
                ("filter", models.JSONField(blank=True, null=True)),
                ("popup_template", models.JSONField(blank=True, null=True)),
                ("style_config", models.JSONField(blank=True, null=True)),
                (
                    "root_group",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="layers",
                        to="layers_geoserver.rootgroup",
                    ),
                ),
                (
                    "thematic_group",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="layers",
                        to="layers_geoserver.thematicgroup",
                    ),
                ),
            ],
            options={"ordering": ["title"]},
        ),
    ]

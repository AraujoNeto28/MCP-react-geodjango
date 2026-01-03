from django.core.exceptions import ValidationError
from django.db import models


class ServiceType(models.TextChoices):
    WFS = "WFS", "WFS"
    WMS = "WMS", "WMS"


class GeometryType(models.TextChoices):
    POINT = "Point", "Point"
    LINESTRING = "LineString", "LineString"
    POLYGON = "Polygon", "Polygon"


class RootGroup(models.Model):
    id = models.SlugField(primary_key=True, max_length=128)
    title = models.CharField(max_length=255)
    service_type = models.CharField(max_length=3, choices=ServiceType.choices)
    workspace = models.CharField(max_length=255)
    visible = models.BooleanField(default=True)
    order = models.IntegerField(default=0)

    class Meta:
        ordering = ["order", "title"]

    def __str__(self) -> str:
        return f"{self.title} ({self.service_type})"


class ThematicGroup(models.Model):
    id = models.SlugField(primary_key=True, max_length=128)
    root_group = models.ForeignKey(RootGroup, on_delete=models.CASCADE, related_name="thematic_groups")
    title = models.CharField(max_length=255)
    visible = models.BooleanField(default=True)
    order = models.IntegerField(default=0)

    class Meta:
        ordering = ["order", "title"]

    def __str__(self) -> str:
        return f"{self.root_group_id} / {self.title}"


class Layer(models.Model):
    id = models.SlugField(primary_key=True, max_length=128)

    root_group = models.ForeignKey(RootGroup, on_delete=models.CASCADE, related_name="layers")
    thematic_group = models.ForeignKey(
        ThematicGroup,
        on_delete=models.CASCADE,
        related_name="layers",
        null=True,
        blank=True,
    )

    title = models.CharField(max_length=255)
    layer_name = models.CharField(max_length=255)
    workspace = models.CharField(max_length=255)
    service_type = models.CharField(max_length=3, choices=ServiceType.choices)

    # Native CRS reported by GeoServer for this layer (e.g. "EPSG:10665").
    # Optional: if blank, frontend assumes EPSG:3857.
    native_crs = models.CharField(max_length=32, null=True, blank=True)

    visible = models.BooleanField(default=True)
    order = models.IntegerField(default=0)

    geometry_type = models.CharField(max_length=16, choices=GeometryType.choices)
    min_zoom = models.IntegerField(null=True, blank=True)

    queryable = models.BooleanField(default=False)
    queryable_fields = models.JSONField(default=list, blank=True)
    table_fields = models.JSONField(default=list, blank=True)

    filter = models.JSONField(null=True, blank=True)
    popup_template = models.JSONField(null=True, blank=True)
    style_config = models.JSONField(null=True, blank=True)

    class Meta:
        ordering = ["order", "title"]

    def clean(self):
        errors = {}

        if self.thematic_group_id and self.thematic_group.root_group_id != self.root_group_id:
            errors["thematic_group"] = "Thematic group must belong to the same root group."

        if self.workspace != self.root_group.workspace:
            # Mantemos o campo por especificação, mas exigimos coerência por padrão.
            errors["workspace"] = "Workspace must match the root group workspace."

        if self.service_type != self.root_group.service_type:
            errors["service_type"] = "Service type must match the root group service type."

        # Check for duplicate order within the same group context
        if self.root_group_id:
            qs = Layer.objects.filter(root_group_id=self.root_group_id)
            if self.thematic_group_id:
                qs = qs.filter(thematic_group_id=self.thematic_group_id)
            else:
                qs = qs.filter(thematic_group__isnull=True)
            
            # Exclude self if updating
            if self.pk:
                qs = qs.exclude(pk=self.pk)
            
            if qs.filter(order=self.order).exists():
                errors["order"] = f"A layer with order {self.order} already exists in this group."

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        # Admin saves bypass our API views, so best-effort fill CRS here.
        # Keep it non-fatal: if GeoServer is unreachable/misconfigured, save still works.
        if not self.native_crs and self.workspace and self.layer_name and not kwargs.get("raw", False):
            try:
                from .geoserver import get_layer_native_crs

                self.native_crs = get_layer_native_crs(self.workspace, self.layer_name)
            except Exception:
                pass

        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.root_group_id}:{self.layer_name}"

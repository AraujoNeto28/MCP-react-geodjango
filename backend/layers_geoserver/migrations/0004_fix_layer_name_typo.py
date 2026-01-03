from django.db import migrations

def fix_typo(apps, schema_editor):
    Layer = apps.get_model("layers_geoserver", "Layer")
    # Update the layer_name to include the space
    Layer.objects.filter(id="infovia-caixas-emenda-subterraneas").update(layer_name="Caixas_de_emenda _subterraneas")

def reverse_fix(apps, schema_editor):
    Layer = apps.get_model("layers_geoserver", "Layer")
    # Revert to the version without space (if needed)
    Layer.objects.filter(id="infovia-caixas-emenda-subterraneas").update(layer_name="Caixas_de_emenda_subterraneas")

class Migration(migrations.Migration):
    dependencies = [
        ("layers_geoserver", "0003_layer_native_crs"),
    ]

    operations = [
        migrations.RunPython(fix_typo, reverse_code=reverse_fix),
    ]

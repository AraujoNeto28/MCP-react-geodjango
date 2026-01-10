from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("layers_geoserver", "0004_fix_layer_name_typo"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="layer",
            name="order",
        ),
        migrations.RemoveField(
            model_name="rootgroup",
            name="order",
        ),
        migrations.RemoveField(
            model_name="thematicgroup",
            name="order",
        ),
    ]

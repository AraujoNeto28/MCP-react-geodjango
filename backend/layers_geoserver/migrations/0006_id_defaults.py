from django.db import migrations, models
import layers_geoserver.models


class Migration(migrations.Migration):
    dependencies = [
        ("layers_geoserver", "0005_remove_order_fields"),
    ]

    operations = [
        migrations.AlterField(
            model_name="rootgroup",
            name="id",
            field=models.SlugField(default=layers_geoserver.models.generate_rootgroup_id, max_length=128, primary_key=True, serialize=False),
        ),
        migrations.AlterField(
            model_name="thematicgroup",
            name="id",
            field=models.SlugField(default=layers_geoserver.models.generate_thematicgroup_id, max_length=128, primary_key=True, serialize=False),
        ),
        migrations.AlterField(
            model_name="layer",
            name="id",
            field=models.SlugField(default=layers_geoserver.models.generate_layer_id, max_length=128, primary_key=True, serialize=False),
        ),
    ]

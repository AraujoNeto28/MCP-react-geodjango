from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("layers_geoserver", "0002_seed_initial_tree"),
    ]

    operations = [
        migrations.AddField(
            model_name="layer",
            name="native_crs",
            field=models.CharField(blank=True, max_length=32, null=True),
        ),
    ]

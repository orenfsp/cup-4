from django.db import migrations


def add_unknown(apps, schema_editor):
    Category = apps.get_model("routing", "Category")
    Category.objects.using(schema_editor.connection.alias).get_or_create(
        slug="unknown", defaults={"name": "Не знаю, как это назвать"}
    )


class Migration(migrations.Migration):
    dependencies = [("routing", "0002_initial")]
    operations = [migrations.RunPython(add_unknown, migrations.RunPython.noop)]

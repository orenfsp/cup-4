from django.db import migrations


def categories(apps, schema_editor):
    Category = apps.get_model("routing", "Category")
    for slug, name in {"bullying": "Травля и оскорбления", "peers": "Конфликт с одноклассниками", "cyberbullying": "Кибербуллинг", "threats": "Давление и угрозы", "teacher": "Конфликт с учителем", "family": "Конфликт с родителями", "legal": "Юридический вопрос"}.items():
        Category.objects.using(schema_editor.connection.alias).get_or_create(slug=slug, defaults={"name": name})


class Migration(migrations.Migration):
    dependencies = [("routing", "0003_unknown_category")]
    operations = [migrations.RunPython(categories, migrations.RunPython.noop)]

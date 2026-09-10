from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("appeals", "0008_stage5_collaboration")]
    operations = [
        migrations.AddField(
            model_name="appealparticipant",
            name="last_seen_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]

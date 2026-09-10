from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):
    dependencies = [("appeals", "0006_appeal_answer_ready_at_appeal_answer_version_and_more")]
    operations = [
        migrations.AddField("appeal", "crisis_codes", models.JSONField(default=list)),
        migrations.AddField("appeal", "crisis_detected_at", models.DateTimeField(blank=True, null=True)),
        migrations.CreateModel(
            name="CrisisContact",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("encrypted_value", models.BinaryField()),
                ("consented_at", models.DateTimeField()),
                ("appeal", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="crisis_contact", to="appeals.appeal")),
            ],
        ),
        migrations.CreateModel(
            name="Attachment",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("storage_key", models.CharField(max_length=128, unique=True)),
                ("content_type", models.CharField(max_length=64)),
                ("size", models.PositiveIntegerField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("appeal", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="attachments", to="appeals.appeal")),
                ("message", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="attachments", to="appeals.message")),
            ],
        ),
    ]

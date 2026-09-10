from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("appeals", "0007_stage4_crisis_attachments")]
    operations = [
        migrations.CreateModel(
            name="Complaint",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("text", models.TextField()), ("created_at", models.DateTimeField(auto_now_add=True)),
                ("status", models.CharField(default="new", max_length=16)),
                ("appeal", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="complaints", to="appeals.appeal")),
            ],
        ),
        migrations.CreateModel(
            name="InternalNote",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("text", models.TextField()), ("created_at", models.DateTimeField(auto_now_add=True)),
                ("appeal", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="internal_notes", to="appeals.appeal")),
                ("author_staff", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name="TransferRequest",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("reason", models.TextField()), ("status", models.CharField(default="pending", max_length=16)),
                ("created_at", models.DateTimeField(auto_now_add=True)), ("reviewed_at", models.DateTimeField(blank=True, null=True)),
                ("appeal", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="transfer_requests", to="appeals.appeal")),
                ("requester", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="transfer_requests", to=settings.AUTH_USER_MODEL)),
                ("target_staff", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="incoming_transfers", to=settings.AUTH_USER_MODEL)),
                ("reviewed_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="reviewed_transfers", to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name="WorkLease",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("acquired_at", models.DateTimeField(auto_now_add=True)), ("expires_at", models.DateTimeField(db_index=True)),
                ("appeal", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="work_lease", to="appeals.appeal")),
                ("staff", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to=settings.AUTH_USER_MODEL)),
            ],
        ),
    ]

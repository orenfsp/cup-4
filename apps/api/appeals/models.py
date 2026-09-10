import uuid

from django.conf import settings
from django.db import models
from otklik_contracts import ENUMS


class Appeal(models.Model):
    """Private persistence. HTTP responses are explicit projections in serializers.py."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    applicant_type = models.CharField(max_length=16, choices=ENUMS["applicantTypes"])
    entry_path = models.CharField(max_length=16, choices=ENUMS["entryPaths"])
    status = models.CharField(max_length=24, choices=ENUMS["appealStatuses"], default="new")
    priority = models.CharField(max_length=16, choices=ENUMS["priorities"], default="standard")
    original_text = models.TextField()
    code_digest = models.CharField(max_length=64, unique=True, editable=False)
    is_crisis = models.BooleanField(default=False)
    crisis_codes = models.JSONField(default=list)
    crisis_detected_at = models.DateTimeField(null=True, blank=True)
    return_count = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    original_answers = models.JSONField(default=dict)
    first_response_at = models.DateTimeField(null=True, blank=True)
    answer_ready_at = models.DateTimeField(null=True, blank=True)
    answer_version = models.PositiveIntegerField(null=True, blank=True)

    category = models.ForeignKey("routing.Category", on_delete=models.PROTECT, default="unknown")
    version = models.PositiveIntegerField(default=0)
    assigned_at = models.DateTimeField(null=True, blank=True)
    operator_accepted_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    last_applicant_activity_at = models.DateTimeField(null=True, blank=True)
    close_kind = models.CharField(max_length=32, blank=True)
    public_resolution = models.TextField(blank=True)

    class Meta:
        indexes = [models.Index(fields=["status", "created_at"], name="appeal_queue_idx")]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(status__in=list(ENUMS["appealStatuses"])),
                name="appeal_valid_status",
            ),
            models.CheckConstraint(
                condition=models.Q(priority__in=list(ENUMS["priorities"])),
                name="appeal_valid_priority",
            ),
            models.CheckConstraint(
                condition=models.Q(applicant_type__in=list(ENUMS["applicantTypes"])),
                name="appeal_valid_applicant",
            ),
            models.CheckConstraint(
                condition=models.Q(entry_path__in=list(ENUMS["entryPaths"])),
                name="appeal_valid_entry",
            ),
        ]


class AppealSession(models.Model):
    token_digest = models.CharField(max_length=64, primary_key=True)
    appeal = models.ForeignKey(Appeal, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(db_index=True)


class AppealParticipant(models.Model):
    appeal = models.ForeignKey(Appeal, on_delete=models.PROTECT, related_name="participants")
    staff = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    role = models.CharField(
        max_length=16, choices={"responsible": "Ответственный", "coexecutor": "Соисполнитель"}
    )
    joined_at = models.DateTimeField(auto_now_add=True)
    last_seen_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["appeal"],
                condition=models.Q(role="responsible", revoked_at__isnull=True),
                name="appeal_one_responsible",
            ),
            models.UniqueConstraint(
                fields=["appeal", "staff"],
                condition=models.Q(revoked_at__isnull=True),
                name="appeal_unique_active_participant",
            ),
            models.CheckConstraint(
                condition=models.Q(role__in=["responsible", "coexecutor"]),
                name="participant_valid_role",
            ),
        ]


class AppealEvent(models.Model):
    appeal = models.ForeignKey(Appeal, on_delete=models.PROTECT, related_name="events")
    actor_role = models.CharField(max_length=16)
    actor_staff = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.PROTECT)
    action = models.CharField(max_length=32)
    from_status = models.CharField(max_length=24, blank=True)
    to_status = models.CharField(max_length=24)
    version = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)
    category_slug = models.CharField(max_length=64, blank=True)
    # Restricted service reasons, never exposed through generic event serializers.
    reason = models.TextField(blank=True)
    assigned_staff = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.PROTECT,
        related_name="assignment_events",
    )
    priority = models.CharField(max_length=16)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["appeal", "version"], name="appeal_event_unique_version"
            ),
            models.CheckConstraint(
                condition=models.Q(
                    actor_role__in=["applicant", "operator", "expert", "admin", "system"]
                ),
                name="event_valid_actor",
            ),
        ]


class Message(models.Model):
    appeal = models.ForeignKey(Appeal, on_delete=models.PROTECT, related_name="messages")
    author_role = models.CharField(
        max_length=16, choices={"applicant": "Заявитель", "expert": "Специалист"}
    )
    author_staff = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.PROTECT)
    kind = models.CharField(
        max_length=16,
        choices={
            "append": "Сообщение",
            "reply": "Ответ",
            "ask": "Вопрос",
            "recommend": "Рекомендации",
        },
    )
    text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    version = models.PositiveIntegerField()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["appeal", "version"], name="message_unique_version")
        ]


class Feedback(models.Model):
    appeal = models.ForeignKey(Appeal, on_delete=models.PROTECT, related_name="feedback")
    answer_version = models.PositiveIntegerField()
    helped = models.BooleanField()
    reason = models.TextField(blank=True)
    rating = models.PositiveSmallIntegerField(null=True, blank=True)
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["appeal", "answer_version"], name="feedback_one_per_answer"
            ),
            models.CheckConstraint(
                condition=models.Q(rating__isnull=True) | models.Q(rating__gte=1, rating__lte=5),
                name="feedback_valid_rating",
            ),
        ]


class CrisisContact(models.Model):
    appeal = models.OneToOneField(Appeal, on_delete=models.CASCADE, related_name="crisis_contact")
    encrypted_value = models.BinaryField()
    consented_at = models.DateTimeField()


class Attachment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    appeal = models.ForeignKey(Appeal, on_delete=models.CASCADE, related_name="attachments")
    message = models.ForeignKey(
        Message, null=True, blank=True, on_delete=models.CASCADE, related_name="attachments"
    )
    storage_key = models.CharField(max_length=128, unique=True)
    content_type = models.CharField(max_length=64)
    size = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)


class InternalNote(models.Model):
    appeal = models.ForeignKey(Appeal, on_delete=models.PROTECT, related_name="internal_notes")
    author_staff = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)


class Complaint(models.Model):
    appeal = models.ForeignKey(Appeal, on_delete=models.PROTECT, related_name="complaints")
    text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=16, default="new")


class TransferRequest(models.Model):
    appeal = models.ForeignKey(Appeal, on_delete=models.PROTECT, related_name="transfer_requests")
    requester = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="transfer_requests"
    )
    target_staff = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="incoming_transfers"
    )
    reason = models.TextField()
    status = models.CharField(max_length=16, default="pending")
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="reviewed_transfers",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)


class WorkLease(models.Model):
    appeal = models.OneToOneField(Appeal, on_delete=models.CASCADE, related_name="work_lease")
    staff = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    acquired_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(db_index=True)

from datetime import timedelta
from typing import Any

from django.utils import timezone
from routing.policy import policy

from appeals.models import Appeal, AppealEvent
from appeals.policies import Actor, can_read_content
from appeals.services import expiration_at


def appeal_data(appeal: Appeal, actor: Actor, *, include_content: bool = True) -> dict[str, Any]:
    limits = policy()
    deadline = expiration_at(appeal)
    latest = (
        appeal.events.exclude(from_status=appeal.status)
        .filter(to_status=appeal.status)
        .order_by("-version")
        .first()
    )
    waiting_since = latest.created_at if latest else appeal.created_at
    data: dict[str, Any] = {
        "id": str(appeal.id),
        "applicant_type": appeal.applicant_type,
        "entry_path": appeal.entry_path,
        "category": appeal.category_id,
        "status": appeal.status,
        "priority": appeal.priority,
        "version": appeal.version,
        "created_at": appeal.created_at.isoformat(),
        "updated_at": appeal.updated_at.isoformat(),
        "assigned_at": appeal.assigned_at.isoformat() if appeal.assigned_at else None,
        "closed_at": appeal.closed_at.isoformat() if appeal.closed_at else None,
        "close_kind": appeal.close_kind,
        "return_count": appeal.return_count,
        "return_limit": limits.return_limit,
        "expires_at": deadline.isoformat() if deadline else None,
    }
    if include_content and can_read_content(actor):
        data.update(
            original_text=appeal.original_text,
            public_resolution=appeal.public_resolution,
            original_answers=appeal.original_answers,
        )
        returned = appeal.feedback.filter(helped=False).order_by("-created_at").first()
        data["return_reason"] = returned.reason if returned else None
        data["attachments"] = [
            {"id": str(item.id), "content_type": item.content_type, "size": item.size}
            for item in appeal.attachments.order_by("created_at")
            if actor.role != "operator" or item.message_id is None
        ]
        if actor.role == "applicant":
            feedback = (
                appeal.feedback.filter(answer_version=appeal.answer_version).first()
                if appeal.answer_version is not None
                else None
            )
            data["feedback"] = (
                {"helped": feedback.helped, "rating": feedback.rating, "comment": feedback.comment}
                if feedback
                else None
            )
    if actor.role in {"operator", "admin", "expert"}:
        data["is_crisis"] = appeal.is_crisis
        data["overdue"] = (
            appeal.status in {"new", "returned"}
            and waiting_since < timezone.now() - timedelta(hours=limits.operator_wait_hours)
        ) or (
            appeal.status in {"assigned", "in_progress"}
            and appeal.assigned_at is not None
            and appeal.assigned_at < timezone.now() - timedelta(hours=limits.expert_wait_hours)
            and not appeal.messages.filter(
                author_role="expert", created_at__gte=appeal.assigned_at
            ).exists()
        )
        data["responsible_id"] = (
            appeal.participants.filter(role="responsible", revoked_at__isnull=True)
            .values_list("staff_id", flat=True)
            .first()
        )
    else:
        data["specialist_role"] = (
            "Специалист" if appeal.participants.filter(revoked_at__isnull=True).exists() else None
        )
    return data


def event_data(event: AppealEvent, actor: Actor) -> dict[str, Any]:
    data: dict[str, Any] = {
        "action": event.action,
        "from_status": event.from_status,
        "to_status": event.to_status,
        "version": event.version,
        "created_at": event.created_at.isoformat(),
    }
    if actor.role in {"operator", "admin"}:
        data.update(
            actor_role=event.actor_role,
            actor_staff_id=event.actor_staff_id,
            assigned_staff_id=event.assigned_staff_id,
            priority=event.priority,
            category_slug=event.category_slug,
        )
        if actor.role == "operator" or event.actor_role == "admin":
            data["reason"] = event.reason
    return data

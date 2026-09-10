from dataclasses import dataclass
from uuid import UUID

from django.db.models import QuerySet
from infrastructure.http import APIError
from staff.models import StaffUser

from appeals.models import Appeal, AppealParticipant


@dataclass(frozen=True)
class Actor:
    role: str
    staff_id: int | None = None
    appeal_id: UUID | None = None

    @classmethod
    def staff(cls, user: StaffUser) -> "Actor":
        return cls(role=user.role, staff_id=user.pk)


def visible_appeals(actor: Actor) -> QuerySet[Appeal]:
    query = Appeal.objects.all()
    if actor.role == "applicant":
        return query.filter(id=actor.appeal_id) if actor.appeal_id is not None else query.none()
    if actor.staff_id is None:
        return query.none()
    if actor.role in {"operator", "admin"}:
        return query
    if actor.role == "expert":
        return query.filter(
            participants__staff_id=actor.staff_id, participants__revoked_at__isnull=True
        ).distinct()
    return query.none()


def require_visible(appeal: Appeal, actor: Actor) -> None:
    if not visible_appeals(actor).filter(id=appeal.id).exists():
        raise APIError("not_found", 404)


def require_responsible(appeal: Appeal, actor: Actor) -> None:
    if not AppealParticipant.objects.filter(
        appeal=appeal,
        staff_id=actor.staff_id,
        role="responsible",
        revoked_at__isnull=True,
    ).exists():
        raise APIError("forbidden", 403)


def require_participant(appeal: Appeal, actor: Actor) -> None:
    if not AppealParticipant.objects.filter(
        appeal=appeal, staff_id=actor.staff_id, revoked_at__isnull=True
    ).exists():
        raise APIError("forbidden", 403)


def can_read_content(actor: Actor) -> bool:
    return actor.role in {"applicant", "operator", "expert"}

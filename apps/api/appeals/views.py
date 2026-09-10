from datetime import timedelta
from pathlib import Path
from typing import cast
from uuid import UUID

from django.conf import settings
from django.core.exceptions import TooManyFilesSent
from django.db import transaction
from django.db.models import Case, Exists, F, IntegerField, OuterRef, Q, Subquery, Value, When
from django.db.models.functions import Coalesce
from django.http import FileResponse, HttpRequest, HttpResponse, JsonResponse
from django.middleware.csrf import get_token, rotate_token
from django.utils import timezone
from django.views.decorators.http import require_GET, require_POST
from infrastructure.http import APIError, endpoint, payload
from infrastructure.limiter import rate_limit
from infrastructure.tokens import session_cookie, session_digest
from otklik_contracts import ENUMS
from routing.policy import policy
from staff.sessions import require_staff

from appeals import access
from appeals.attachments import MAX_FILES, MAX_TOTAL, remove, store_upload
from appeals.crisis import approved_contacts, decrypt_contact
from appeals.models import (
    AppealEvent,
    AppealSession,
    Attachment,
    CrisisContact,
    Message,
    WorkLease,
)
from appeals.policies import Actor, visible_appeals
from appeals.serializers import appeal_data, event_data
from appeals.services import apply_action, create_appeal, exchange_code
from appeals.transitions import NONTERMINAL


def applicant_actor(request: HttpRequest) -> Actor:
    session = access.require_appeal_session(request)
    return Actor("applicant", appeal_id=session.appeal_id)


@require_POST
@endpoint
def create(request: HttpRequest) -> JsonResponse:
    rate_limit(request, "create", 3, 30)
    try:
        data = payload(request, "create")
        uploads = list(request.FILES.getlist("attachments"))
    except TooManyFilesSent:
        raise APIError("attachment_too_large", 413) from None
    if set(request.FILES) - {"attachments"}:
        raise APIError("invalid_request")
    if len(uploads) > MAX_FILES or sum(item.size or 0 for item in uploads) > MAX_TOTAL:
        raise APIError("attachment_too_large", 413)
    stored: list[tuple[str, int, str]] = []
    try:
        for upload in uploads:
            stored.append(store_upload(upload))
            if sum(size for _, size, _ in stored) > MAX_TOTAL:
                raise APIError("attachment_too_large", 413)
        with transaction.atomic():
            appeal, code, token = create_appeal(data, request.COOKIES.get(access.COOKIE, ""))
            Attachment.objects.bulk_create(
                [
                    Attachment(appeal=appeal, storage_key=key, size=size, content_type=content)
                    for key, size, content in stored
                ]
            )
    except Exception:
        for key, _, _ in stored:
            remove(key)
        raise
    rotate_token(request)
    response = JsonResponse(
        {
            "appeal": appeal_data(appeal, Actor("applicant", appeal_id=appeal.id)),
            "access_code": code,
            "csrf_token": get_token(request),
        },
        status=201,
    )
    session_cookie(response, access.COOKIE, token, access.COOKIE_PATH, access.TTL)
    return response


@require_POST
@endpoint
def exchange(request: HttpRequest) -> JsonResponse:
    rate_limit(request, "code", 5, 120)
    data = payload(request, "code")
    appeal, token = exchange_code(data["code"], request.COOKIES.get(access.COOKIE, ""))
    rotate_token(request)
    response = JsonResponse(
        {
            "appeal": appeal_data(appeal, Actor("applicant", appeal_id=appeal.id)),
            "csrf_token": get_token(request),
        }
    )
    session_cookie(response, access.COOKIE, token, access.COOKIE_PATH, access.TTL)
    return response


@require_POST
@endpoint
def applicant_logout(request: HttpRequest) -> JsonResponse:
    payload(request, "empty")
    AppealSession.objects.filter(
        token_digest=session_digest(request.COOKIES.get(access.COOKIE, ""))
    ).delete()
    response = JsonResponse({"status": "ok"})
    response.delete_cookie(access.COOKIE, path=access.COOKIE_PATH, samesite="Lax")
    return response


def detail(appeal_id: UUID, actor: Actor) -> JsonResponse:
    appeal = visible_appeals(actor).filter(pk=appeal_id).first()
    if appeal is None:
        raise APIError("not_found", 404)
    return JsonResponse({"appeal": appeal_data(appeal, actor)})


@require_GET
@endpoint
def applicant_detail(request: HttpRequest, appeal_id: UUID) -> JsonResponse:
    return detail(appeal_id, applicant_actor(request))


@require_GET
@endpoint
def staff_detail(request: HttpRequest, appeal_id: UUID) -> JsonResponse:
    return detail(appeal_id, Actor.staff(require_staff(request)))


@require_GET
@endpoint
def crisis_contacts(request: HttpRequest) -> JsonResponse:
    return JsonResponse(approved_contacts())


@require_GET
@endpoint
def crisis_contact(request: HttpRequest, appeal_id: UUID) -> JsonResponse:
    actor = Actor.staff(require_staff(request))
    if actor.role != "operator":
        raise APIError("forbidden", 403)
    appeal = visible_appeals(actor).filter(pk=appeal_id, is_crisis=True).first()
    if appeal is None:
        raise APIError("not_found", 404)
    contact = CrisisContact.objects.filter(appeal=appeal).first()
    return JsonResponse({"contact": decrypt_contact(contact) if contact else None})


@require_GET
@endpoint
def attachment_download(request: HttpRequest, attachment_id: UUID) -> HttpResponse:
    actor = (
        applicant_actor(request)
        if request.path.startswith("/api/applicant/")
        else Actor.staff(require_staff(request))
    )
    attachment = Attachment.objects.select_related("appeal").filter(pk=attachment_id).first()
    if attachment is None or visible_appeals(actor).filter(pk=attachment.appeal_id).first() is None:
        raise APIError("not_found", 404)
    if actor.role == "admin":
        raise APIError("forbidden", 403)
    if actor.role == "operator" and attachment.message_id is not None:
        raise APIError("forbidden", 403)
    path = Path(settings.PRIVATE_ATTACHMENTS_ROOT) / attachment.storage_key
    if not path.is_file():
        raise APIError("not_found", 404)
    response = FileResponse(path.open("rb"), content_type=attachment.content_type)
    response["Content-Disposition"] = f'attachment; filename="attachment-{attachment.id}.png"'
    response["X-Content-Type-Options"] = "nosniff"
    return cast(HttpResponse, response)


@require_GET
@endpoint
def staff_list(request: HttpRequest) -> JsonResponse:
    actor = Actor.staff(require_staff(request))
    query = visible_appeals(actor)
    for field, enum in [("status", "appealStatuses"), ("priority", "priorities")]:
        value = request.GET.get(field)
        if value:
            if value not in ENUMS[enum]:
                raise APIError("invalid_request")
            query = query.filter(**{field: value})
    if request.GET.get("category"):
        query = query.filter(category_id=request.GET["category"])
    if request.GET.get("scope", "active") == "active":
        query = query.filter(status__in=NONTERMINAL)
    elif request.GET.get("scope") != "all":
        raise APIError("invalid_request")
    changes = (
        AppealEvent.objects.filter(appeal_id=OuterRef("pk"))
        .exclude(from_status=F("to_status"))
        .order_by("-version")
    )
    timed = query.annotate(
        wait_since=Coalesce(Subquery(changes.values("created_at")[:1]), "created_at"),
        answered=Exists(
            Message.objects.filter(
                appeal_id=OuterRef("pk"),
                author_role="expert",
                created_at__gte=OuterRef("assigned_at"),
            )
        ),
    )
    limits = policy()
    overdue_count = timed.filter(
        Q(
            status__in=["new", "returned"],
            wait_since__lt=timezone.now() - timedelta(hours=limits.operator_wait_hours),
        )
        | Q(
            status__in=["assigned", "in_progress"],
            assigned_at__lt=timezone.now() - timedelta(hours=limits.expert_wait_hours),
            answered=False,
        )
    ).count()
    offset = bounded_number(request, "offset")
    query = query.annotate(
        priority_order=Case(
            When(priority="urgent", then=Value(0)),
            When(priority="standard", then=Value(1)),
            default=Value(2),
            output_field=IntegerField(),
        )
    ).order_by("-is_crisis", "priority_order", "created_at", "id")
    rows = list(query[offset : offset + 51])
    return JsonResponse(
        {
            "appeals": [appeal_data(item, actor, include_content=False) for item in rows[:50]],
            "has_more": len(rows) > 50,
            "overdue_count": overdue_count,
            "next_offset": offset + 50 if len(rows) > 50 else None,
        }
    )


@require_POST
@endpoint
def staff_action(request: HttpRequest, appeal_id: UUID) -> JsonResponse:
    actor = Actor.staff(require_staff(request))
    data = payload(request, "action")
    appeal = apply_action(appeal_id, actor, data)
    return JsonResponse({"appeal": appeal_data(appeal, actor)})


@require_GET
@endpoint
def staff_events(request: HttpRequest, appeal_id: UUID) -> JsonResponse:
    actor = Actor.staff(require_staff(request))
    appeal = visible_appeals(actor).filter(pk=appeal_id).first()
    if appeal is None:
        raise APIError("not_found", 404)
    events = appeal.events.all()
    if actor.role != "operator":
        events = events.exclude(action="complaint")
    rows = list(events.order_by("-version")[:101])
    return JsonResponse(
        {"events": [event_data(event, actor) for event in rows[:100]], "has_more": len(rows) > 100}
    )


@require_GET
@endpoint
def collaboration(request: HttpRequest, appeal_id: UUID) -> JsonResponse:
    actor = Actor.staff(require_staff(request))
    appeal = visible_appeals(actor).filter(pk=appeal_id).first()
    if appeal is None:
        raise APIError("not_found", 404)
    if actor.role not in {"expert", "operator"}:
        raise APIError("forbidden", 403)
    now = timezone.now()
    lease = WorkLease.objects.filter(appeal=appeal, expires_at__gt=now).first()
    participants = list(appeal.participants.select_related("staff").order_by("joined_at"))
    data: dict[str, object] = {
        "participants": [
            {
                "id": p.staff_id,
                "name": p.staff.username,
                "role": p.role,
                "joined_at": p.joined_at.isoformat(),
                "revoked_at": p.revoked_at.isoformat() if p.revoked_at else None,
                "present": p.revoked_at is None
                and p.last_seen_at is not None
                and p.last_seen_at > now - timedelta(seconds=90),
            }
            for p in participants
        ],
        "lease": {"staff_id": lease.staff_id, "expires_at": lease.expires_at.isoformat()}
        if lease
        else None,
        "transfers": [
            {
                "id": t.id,
                "requester_id": t.requester_id,
                "target_staff_id": t.target_staff_id,
                "reason": t.reason,
                "status": t.status,
                "created_at": t.created_at.isoformat(),
            }
            for t in appeal.transfer_requests.order_by("created_at")
        ],
    }
    if actor.role == "expert":
        data["notes"] = [
            {"id": n.id, "text": n.text, "created_at": n.created_at.isoformat()}
            for n in appeal.internal_notes.order_by("created_at")
        ]
    else:
        data["complaints"] = [
            {"id": c.id, "text": c.text, "status": c.status, "created_at": c.created_at.isoformat()}
            for c in appeal.complaints.order_by("created_at")
        ]
        data["requests"] = [
            {"id": e.id, "action": e.action, "reason": e.reason}
            for e in appeal.events.filter(action__in=["request_coexecutor", "request_priority"])
        ]
    return JsonResponse(data)


@require_GET
@endpoint
def current_appeal(request: HttpRequest) -> JsonResponse:
    actor = applicant_actor(request)
    assert actor.appeal_id is not None
    return detail(actor.appeal_id, actor)


@require_POST
@endpoint
def applicant_action(request: HttpRequest, appeal_id: UUID) -> JsonResponse:
    actor = applicant_actor(request)
    data = payload(request, "action")
    appeal = apply_action(appeal_id, actor, data)
    return JsonResponse({"appeal": appeal_data(appeal, actor)})


def messages(request: HttpRequest, appeal_id: UUID, actor: Actor) -> JsonResponse:
    if actor.role not in {"applicant", "expert"}:
        raise APIError("forbidden", 403)
    appeal = visible_appeals(actor).filter(pk=appeal_id).first()
    if appeal is None:
        raise APIError("not_found", 404)
    query = Message.objects.filter(appeal=appeal)
    before = bounded_number(request, "before")
    if before:
        query = query.filter(pk__lt=before)
    rows = list(query.order_by("-id")[:101])
    return JsonResponse(
        {
            "messages": [
                {
                    "id": item.pk,
                    "kind": item.kind,
                    "author_role": item.author_role,
                    "text": item.text,
                    "created_at": item.created_at.isoformat(),
                }
                for item in reversed(rows[:100])
            ],
            "has_more": len(rows) > 100,
        }
    )


@require_GET
@endpoint
def applicant_messages(request: HttpRequest, appeal_id: UUID) -> JsonResponse:
    return messages(request, appeal_id, applicant_actor(request))


@require_GET
@endpoint
def staff_messages(request: HttpRequest, appeal_id: UUID) -> JsonResponse:
    return messages(request, appeal_id, Actor.staff(require_staff(request)))


def bounded_number(request: HttpRequest, name: str) -> int:
    value = request.GET.get(name, "0")
    if not value.isascii() or not value.isdigit() or len(value) > 9:
        raise APIError("invalid_request")
    return int(value)

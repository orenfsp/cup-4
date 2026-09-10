from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from django.db import IntegrityError, transaction
from django.utils import timezone
from infrastructure.http import APIError
from routing.models import Category, RoutingRule
from routing.policy import lock_policy, policy
from staff.models import StaffUser

from appeals import access
from appeals.crisis import detect, encrypt_contact, mark
from appeals.models import (
    Appeal,
    AppealEvent,
    AppealParticipant,
    Complaint,
    Feedback,
    InternalNote,
    Message,
    TransferRequest,
    WorkLease,
)
from appeals.policies import Actor, require_participant, require_responsible, require_visible
from appeals.transitions import ACTIVE, TERMINAL, transition_for


def create_appeal(data: dict[str, Any], previous_session: str = "") -> tuple[Appeal, str, str]:
    category_id = data.get("category", "unknown")
    if data["entry_path"] == "story" and category_id != "unknown":
        raise APIError("invalid_category")
    if data["entry_path"] == "category" and "category" not in data:
        raise APIError("category_required")
    category = Category.objects.filter(pk=category_id, is_active=True).first()
    if category is None:
        raise APIError("invalid_category")
    for _ in range(3):
        code = access.generate_code()
        digest = access.code_digest(code)
        try:
            with transaction.atomic():
                lock_policy()
                if not Category.objects.filter(pk=category.pk, is_active=True).exists():
                    raise APIError("invalid_category")
                appeal = Appeal.objects.create(
                    applicant_type=data["applicant_type"],
                    entry_path="story" if category_id == "unknown" else data["entry_path"],
                    category=category,
                    original_text=data["original_text"].strip(),
                    original_answers=data.get("answers", {}),
                    code_digest=digest,
                    last_applicant_activity_at=timezone.now(),
                )
                codes = detect(appeal.original_text, appeal.original_answers)
                if codes:
                    mark(appeal, codes)
                contact = data.get("crisis_contact")
                if contact and not appeal.is_crisis:
                    raise APIError("contact_requires_crisis")
                if contact:
                    from appeals.models import CrisisContact

                    CrisisContact.objects.create(
                        appeal=appeal,
                        encrypted_value=encrypt_contact(contact["value"]),
                        consented_at=timezone.now(),
                    )
                AppealEvent.objects.create(
                    appeal=appeal,
                    actor_role="applicant",
                    action="create",
                    to_status="new",
                    version=0,
                    priority="standard",
                    category_slug=str(appeal.category_id),
                )
                token = access.create_session(appeal, previous_session)
            return appeal, code, token
        except IntegrityError:
            if not Appeal.objects.filter(code_digest=digest).exists():
                raise
    raise APIError("try_again", 503)


@transaction.atomic
def exchange_code(code: str, previous_session: str = "") -> tuple[Appeal, str]:
    appeal = Appeal.objects.select_for_update().filter(code_digest=access.code_digest(code)).first()
    if appeal is None:
        raise APIError("invalid_code", 401)
    appeal.last_applicant_activity_at = timezone.now()
    appeal.save(update_fields=["last_applicant_activity_at"])
    return appeal, access.create_session(appeal, previous_session)


def validate_target(appeal: Appeal, expert_id: int) -> StaffUser:
    # Caller locks all involved staff rows in ascending PK order before this check.
    expert = StaffUser.objects.filter(pk=expert_id, role="expert", is_active=True).first()
    if expert is None:
        raise APIError("expert_unavailable", 409)
    if not RoutingRule.objects.filter(
        category=appeal.category,
        category__is_active=True,
        applicant_type=appeal.applicant_type,
        is_active=True,
        group__is_active=True,
        group__members=expert,
    ).exists():
        raise APIError("expert_not_allowed", 409)
    load = (
        AppealParticipant.objects.filter(
            staff=expert, revoked_at__isnull=True, appeal__status__in=ACTIVE
        )
        .exclude(appeal=appeal)
        .count()
    )
    if load >= expert.max_active_appeals:
        raise APIError("expert_at_capacity", 409)
    return expert


@transaction.atomic
def apply_action(appeal_id: UUID, actor: Actor, data: dict[str, Any]) -> Appeal:
    lock_policy()
    # Global order: policy, staff IDs ascending, then appeal. Serializes capacity across appeals.
    staff_ids = {value for value in [actor.staff_id, data.get("expert_id")] if value is not None}
    if data.get("action") == "approve_transfer":
        target_id = (
            TransferRequest.objects.filter(pk=data.get("transfer_id", 0), appeal_id=appeal_id)
            .values_list("target_staff_id", flat=True)
            .first()
        )
        if target_id is not None:
            staff_ids.add(target_id)
    locked_staff = {
        user.pk: user
        for user in StaffUser.objects.select_for_update().filter(pk__in=staff_ids).order_by("pk")
    }
    if actor.role not in {"applicant", "system"}:
        if actor.staff_id is None or actor.staff_id not in locked_staff:
            raise APIError("forbidden", 403)
        current = locked_staff[actor.staff_id]
        if not current.is_active or current.role != actor.role:
            raise APIError("forbidden", 403)
    staff_id = actor.staff_id
    appeal = Appeal.objects.select_for_update().filter(pk=appeal_id).first()
    if appeal is None:
        raise APIError("not_found", 404)
    if actor.role != "system":
        require_visible(appeal, actor)
    action = data["action"]
    rule = transition_for(action, appeal.status, actor.role)
    allowed = {"action", "expected_version", "reason"}
    if action in {"assign", "admin_assign"}:
        allowed.add("expert_id")
        if "expert_id" not in data:
            raise APIError("expert_required")
    if action == "set_priority":
        allowed.add("priority")
        if "priority" not in data:
            raise APIError("priority_required")
    if action in {"append", "reply", "ask", "recommend"}:
        allowed = {"action", "expected_version", "text"}
        if not data.get("text", "").strip():
            raise APIError("text_required")
    if action == "set_category":
        allowed.add("category")
        if "category" not in data:
            raise APIError("category_required")
    if action == "add_coexecutor":
        allowed.add("expert_id")
        if "expert_id" not in data:
            raise APIError("expert_required")
    if action == "approve_transfer":
        allowed.add("transfer_id")
        if "transfer_id" not in data:
            raise APIError("invalid_request")
    if action in {"add_note", "request_transfer", "complaint"}:
        allowed = {"action", "expected_version", "reason", "text", "expert_id"}
        if action == "request_transfer":
            if "expert_id" not in data:
                raise APIError("expert_required")
        if (
            action in {"add_note", "complaint"}
            and not data.get("text", "").strip()
            and not data.get("reason", "").strip()
        ):
            raise APIError("text_required")
    if action == "add_note":
        if not data.get("text", "").strip():
            raise APIError("text_required")
        allowed = {"action", "expected_version", "text"}
    if action in {"heartbeat", "claim_lease", "release_lease", "presence"}:
        allowed = {"action", "expected_version"}
    if action in {"helped", "not_helped", "rate"}:
        allowed = {"action", "expected_version", "rating", "comment"}
        if action == "not_helped":
            allowed.add("reason")
    if set(data) - allowed:
        raise APIError("invalid_request")
    reason = data.get("reason", "").strip()
    if rule.reason and not reason:
        raise APIError("reason_required")
    if data["expected_version"] != appeal.version:
        raise APIError("version_conflict", 409)
    now = timezone.now()
    if actor.role == "expert":
        if action == "start":
            require_responsible(appeal, actor)
        else:
            require_participant(appeal, actor)
        if action in {
            "ask",
            "recommend",
            "add_note",
            "request_transfer",
            "heartbeat",
            "release_lease",
        }:
            lease = WorkLease.objects.filter(
                appeal=appeal, staff_id=actor.staff_id, expires_at__gt=now
            ).first()
            if lease is None:
                raise APIError("work_lease_required", 409)
    previous_status = appeal.status
    target = None
    if action in {"assign", "admin_assign"}:
        target = validate_target(appeal, data["expert_id"])
        appeal.participants.filter(revoked_at__isnull=True).update(revoked_at=now)
        AppealParticipant.objects.create(appeal=appeal, staff=target, role="responsible")
        appeal.assigned_at = now
    elif action in {"start", "claim_lease"}:
        lease = WorkLease.objects.filter(appeal=appeal).first()
        if lease is not None and lease.expires_at > now and lease.staff_id != actor.staff_id:
            raise APIError("work_lease_busy", 409)
        WorkLease.objects.update_or_create(
            appeal=appeal,
            defaults={"staff_id": actor.staff_id, "expires_at": now + timedelta(minutes=5)},
        )
    elif action == "heartbeat":
        WorkLease.objects.filter(appeal=appeal, staff_id=actor.staff_id).update(
            expires_at=now + timedelta(minutes=5)
        )
    elif action == "release_lease":
        WorkLease.objects.filter(appeal=appeal, staff_id=actor.staff_id).delete()
    elif action == "presence":
        appeal.participants.filter(staff_id=actor.staff_id, revoked_at__isnull=True).update(
            last_seen_at=now
        )
    elif action == "expire":
        deadline = expiration_at(appeal)
        if deadline is None or deadline > now:
            raise APIError("invalid_transition", 409)
        appeal.close_kind = "system_timeout"
        appeal.closed_at = now
    elif action == "add_note":
        assert staff_id is not None
        InternalNote.objects.create(
            appeal=appeal,
            author_staff_id=staff_id,
            text=data.get("text", data.get("reason", "")).strip(),
        )
    elif action == "complaint":
        Complaint.objects.create(
            appeal=appeal, text=data.get("text", data.get("reason", "")).strip()
        )
    elif action == "request_transfer":
        if data["expert_id"] == actor.staff_id:
            raise APIError("no_change", 409)
        target = validate_target(appeal, data["expert_id"])
        assert staff_id is not None
        TransferRequest.objects.create(
            appeal=appeal, requester_id=staff_id, target_staff=target, reason=reason
        )
    elif action == "add_coexecutor":
        target = validate_target(appeal, data["expert_id"])
        responsible = appeal.participants.filter(
            role="responsible", revoked_at__isnull=True
        ).first()
        if (
            responsible is None
            or not target.specialist_groups.filter(is_active=True)
            .exclude(members=responsible.staff_id)
            .exists()
        ):
            raise APIError("different_profile_required", 409)
        if AppealParticipant.objects.filter(
            appeal=appeal, staff=target, revoked_at__isnull=True
        ).exists():
            raise APIError("no_change", 409)
        AppealParticipant.objects.create(appeal=appeal, staff=target, role="coexecutor")
    elif action == "approve_transfer":
        request = (
            TransferRequest.objects.select_for_update()
            .filter(pk=data["transfer_id"], appeal=appeal, status="pending")
            .first()
        )
        if request is None:
            raise APIError("not_found", 404)
        if not appeal.participants.filter(
            staff_id=request.requester_id, revoked_at__isnull=True
        ).exists():
            raise APIError("invalid_transition", 409)
        target = validate_target(appeal, request.target_staff_id)
        if appeal.participants.filter(
            staff=target, role="responsible", revoked_at__isnull=True
        ).exists():
            raise APIError("no_change", 409)
        appeal.assigned_at = now
        appeal.participants.filter(revoked_at__isnull=True).update(revoked_at=now)
        WorkLease.objects.filter(appeal=appeal).delete()
        AppealParticipant.objects.create(appeal=appeal, staff=target, role="responsible")
        request.status = "approved"
        request.reviewed_by_id = actor.staff_id
        request.reviewed_at = now
        request.save(update_fields=["status", "reviewed_by", "reviewed_at"])
    elif action == "set_category":
        category = Category.objects.filter(pk=data["category"], is_active=True).first()
        if category is None:
            raise APIError("invalid_category")
        if category.pk == appeal.category_id:
            raise APIError("no_change", 409)
        appeal.category = category
    elif action in {"append", "reply", "ask", "recommend"}:
        Message.objects.create(
            appeal=appeal,
            author_role=actor.role,
            author_staff_id=actor.staff_id,
            kind=action,
            text=data["text"].strip(),
            version=appeal.version + 1,
        )
        codes = detect(data["text"])
        if codes:
            mark(appeal, codes)
        if actor.role == "expert" and appeal.first_response_at is None:
            appeal.first_response_at = now
        if action == "recommend":
            appeal.answer_ready_at = now
            appeal.answer_version = appeal.version + 1
    elif action in {"helped", "not_helped"}:
        if appeal.answer_version is None:
            raise APIError("invalid_transition", 409)
        if action == "not_helped" and appeal.return_count >= policy().return_limit:
            raise APIError("return_limit", 409)
        Feedback.objects.create(
            appeal=appeal,
            answer_version=appeal.answer_version,
            helped=action == "helped",
            reason=reason,
            rating=data.get("rating"),
            comment=data.get("comment", "").strip(),
        )
        if action == "helped":
            appeal.close_kind = "applicant_confirmed"
            appeal.closed_at = now
        else:
            appeal.return_count += 1
    elif action == "rate":
        if appeal.answer_version is None:
            raise APIError("invalid_transition", 409)
        feedback = appeal.feedback.filter(helped=True, answer_version=appeal.answer_version).first()
        if feedback is None or feedback.rating is not None:
            raise APIError("invalid_transition", 409)
        if "rating" not in data:
            raise APIError("rating_required")
        feedback.rating = data["rating"]
        feedback.comment = data.get("comment", "").strip()
        feedback.save(update_fields=["rating", "comment"])
    elif action == "set_priority":
        if appeal.priority == data["priority"]:
            raise APIError("no_change", 409)
        appeal.priority = data["priority"]
    elif action in {"reject", "resolve"}:
        appeal.public_resolution = reason
        appeal.close_kind = "operator_rejected" if action == "reject" else "operator_resolved"
        appeal.closed_at = now
    if action in {"presence", "heartbeat", "claim_lease", "release_lease"}:
        return appeal
    appeal.status = rule.target or appeal.status
    if appeal.status in TERMINAL or action in {"requeue", "not_helped", "admin_assign"}:
        if action != "admin_assign":
            appeal.participants.filter(revoked_at__isnull=True).update(revoked_at=now)
        WorkLease.objects.filter(appeal=appeal).delete()
    if actor.role == "operator" and appeal.operator_accepted_at is None:
        appeal.operator_accepted_at = now
    if actor.role == "applicant":
        appeal.last_applicant_activity_at = now
    appeal.version += 1
    appeal.save()
    AppealEvent.objects.create(
        appeal=appeal,
        actor_role=actor.role,
        actor_staff_id=actor.staff_id,
        action=action,
        from_status=previous_status,
        to_status=appeal.status,
        version=appeal.version,
        reason=reason,
        assigned_staff=target,
        priority=appeal.priority,
        category_slug=str(appeal.category_id),
    )
    return appeal


def expiration_at(appeal: Appeal) -> datetime | None:
    if appeal.status not in {"needs_info", "answer_ready"}:
        return None
    entry = (
        appeal.events.filter(to_status=appeal.status)
        .exclude(from_status=appeal.status)
        .order_by("-version")
        .first()
    )
    since = entry.created_at if entry else appeal.created_at
    if appeal.last_applicant_activity_at:
        since = max(since, appeal.last_applicant_activity_at)
    return since + timedelta(days=policy().auto_close_days)

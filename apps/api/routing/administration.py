"""Explicit admin configuration API. Never serialize staff ORM objects or passwords."""

import re
from typing import Any

from appeals.models import AppealParticipant
from django.db import IntegrityError, transaction
from django.http import HttpRequest, JsonResponse
from django.views.decorators.http import require_GET, require_POST
from infrastructure.http import APIError, endpoint, payload
from staff.models import StaffSession, StaffUser
from staff.sessions import require_staff

from routing.models import Category, ConfigurationEvent, RoutingRule, SpecialistGroup
from routing.policy import lock_policy


def administrator(request: HttpRequest) -> StaffUser:
    user = require_staff(request)
    if user.role != "admin":
        raise APIError("forbidden", 403)
    return user


@transaction.atomic
def snapshot() -> dict[str, Any]:
    config = lock_policy()
    return {
        "version": config.version,
        "limits": {name: getattr(config, name) for name in LIMITS},
        "categories": list(Category.objects.order_by("slug").values("slug", "name", "is_active")),
        "groups": [
            {
                "id": g.pk,
                "name": g.name,
                "is_active": g.is_active,
                "members": list(g.members.values_list("pk", flat=True)),
            }
            for g in SpecialistGroup.objects.prefetch_related("members").order_by("pk")
        ],
        "rules": list(
            RoutingRule.objects.order_by("pk").values(
                "id", "category_id", "group_id", "applicant_type", "is_active"
            )
        ),
        "users": list(
            StaffUser.objects.order_by("pk").values(
                "id", "username", "role", "is_active", "max_active_appeals"
            )
        ),
        "events": list(
            ConfigurationEvent.objects.order_by("-version")[:100].values(
                "version", "resource", "target", "actor_id", "reason", "created_at"
            )
        ),
    }


LIMITS = {
    "return_limit": (1, 10),
    "operator_wait_hours": (1, 168),
    "expert_wait_hours": (1, 720),
    "auto_close_days": (1, 90),
}


def integer(value: Any, low: int = 1, high: int = 2147483647) -> int:
    if type(value) is not int or not low <= value <= high:
        raise APIError("invalid_request")
    return int(value)


def string(value: Any, maximum: int = 120) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > maximum:
        raise APIError("invalid_request")
    return value.strip()


def active(data: dict[str, Any]) -> bool:
    value = data.get("is_active", True)
    if type(value) is not bool:
        raise APIError("invalid_request")
    return bool(value)


def fields(data: dict[str, Any], allowed: set[str], required: set[str]) -> None:
    if set(data) - allowed or required - set(data):
        raise APIError("invalid_request")


@require_GET
@endpoint
def configuration(request: HttpRequest) -> JsonResponse:
    administrator(request)
    return JsonResponse(snapshot())


@transaction.atomic
def change(user: StaffUser, body: dict[str, Any]) -> None:
    config = lock_policy()
    # Recheck under the shared configuration lock after authenticating the request.
    user = StaffUser.objects.select_for_update().get(pk=user.pk)
    if not user.is_active or user.role != "admin":
        raise APIError("forbidden", 403)
    if integer(body["expected_version"], 0) != config.version:
        raise APIError("version_conflict", 409)
    resource, data = body["resource"], body["data"]
    target = "1"
    reason = string(body["reason"], 2000)
    if resource == "category":
        fields(data, {"slug", "name", "is_active"}, {"slug", "name"})
        slug = string(data["slug"], 64)
        if not re.fullmatch(r"[a-z0-9_-]{1,64}", slug):
            raise APIError("invalid_request")
        if slug == "unknown" and (
            not active(data) or string(data["name"]) != "Не знаю, как это назвать"
        ):
            raise APIError("unknown_required", 409)
        Category.objects.update_or_create(
            pk=slug, defaults={"name": string(data["name"]), "is_active": active(data)}
        )
        target = slug
    elif resource == "group":
        fields(data, {"id", "name", "members", "is_active"}, {"name", "members"})
        members = data["members"]
        if not isinstance(members, list) or len(members) > 200:
            raise APIError("invalid_request")
        ids = {integer(pk) for pk in members}
        if StaffUser.objects.filter(pk__in=ids, role="expert", is_active=True).count() != len(ids):
            raise APIError("expert_unavailable", 409)
        if "id" in data:
            group = SpecialistGroup.objects.filter(pk=integer(data["id"])).first()
            if group is None:
                raise APIError("not_found", 404)
        else:
            group = SpecialistGroup()
        group.name, group.is_active = string(data["name"]), active(data)
        group.save()
        group.members.set(ids)
        target = str(group.pk)
    elif resource == "rule":
        fields(
            data,
            {"id", "category_id", "group_id", "applicant_type", "is_active"},
            {"category_id", "group_id", "applicant_type"},
        )
        category = Category.objects.filter(pk=string(data["category_id"], 64)).first()
        group = SpecialistGroup.objects.filter(pk=integer(data["group_id"])).first()
        if (
            category is None
            or group is None
            or string(data["applicant_type"]) not in {"student", "parent", "teacher"}
        ):
            raise APIError("invalid_request")
        if active(data) and (not category.is_active or not group.is_active):
            raise APIError("invalid_request")
        if "id" in data:
            rule = RoutingRule.objects.filter(pk=integer(data["id"])).first()
            if rule is None:
                raise APIError("not_found", 404)
        else:
            rule = RoutingRule()
        rule.category, rule.group = category, group
        rule.applicant_type, rule.is_active = data["applicant_type"], active(data)
        rule.save()
        target = str(rule.pk)
    elif resource == "staff":
        fields(
            data,
            {"id", "username", "role", "password", "is_active", "max_active_appeals"},
            {"username", "role", "max_active_appeals"},
        )
        role = string(data["role"])
        if role not in {"operator", "expert", "admin"}:
            raise APIError("invalid_request")
        if "id" in data:
            staff = StaffUser.objects.select_for_update().filter(pk=integer(data["id"])).first()
            if staff is None:
                raise APIError("not_found", 404)
            if (not active(data) or staff.role != role) and AppealParticipant.objects.filter(
                staff=staff, revoked_at__isnull=True
            ).exists():
                raise APIError("active_assignments", 409)
            if staff.pk == user.pk and (not active(data) or role != "admin"):
                raise APIError("keep_admin", 409)
        else:
            staff = StaffUser()
            if "password" not in data:
                raise APIError("password_required")
        username = string(data["username"], 150)
        if not re.fullmatch(r"[\w.@+-]{1,150}", username):
            raise APIError("invalid_request")
        staff.username, staff.role, staff.is_active = username, role, active(data)
        staff.max_active_appeals = integer(data["max_active_appeals"], 1, 1000)
        if "password" in data:
            password = string(data["password"], 256)
            if len(password) < 12:
                raise APIError("weak_password")
            staff.set_password(password)
        staff.save()
        if "password" in data or not staff.is_active or "id" in data:
            StaffSession.objects.filter(user=staff).delete()
        target = str(staff.pk)
    elif resource == "limits":
        fields(data, set(LIMITS), set(LIMITS))
        for name, (low, high) in LIMITS.items():
            setattr(config, name, integer(data[name], low, high))
    else:
        raise APIError("invalid_request")
    config.version += 1
    config.save()
    # No snapshots: in particular, passwords never enter the audit or response.
    ConfigurationEvent.objects.create(
        actor=user, resource=resource, target=target, version=config.version, reason=reason
    )


@require_POST
@endpoint
@transaction.atomic
def update(request: HttpRequest) -> JsonResponse:
    user = administrator(request)
    body = payload(request, "administration")
    try:
        change(user, body)
    except IntegrityError:
        raise APIError("configuration_conflict", 409) from None
    return JsonResponse(snapshot())

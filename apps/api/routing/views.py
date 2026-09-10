from typing import Any
from uuid import UUID

from appeals.models import Appeal
from appeals.policies import Actor, require_participant
from appeals.transitions import ACTIVE
from django.db.models import Count, Q
from django.http import HttpRequest, JsonResponse
from django.views.decorators.http import require_GET
from infrastructure.http import APIError, endpoint
from otklik_contracts import QUESTIONS
from staff.models import StaffUser
from staff.sessions import require_staff

from routing.models import Category, RoutingRule


@require_GET
def catalog(request: HttpRequest) -> JsonResponse:
    return JsonResponse(
        {
            "categories": list(
                Category.objects.filter(is_active=True).order_by("name").values("slug", "name")
            ),
            "questions": QUESTIONS,
        }
    )


def candidates(appeal: Appeal) -> dict[str, Any]:
    rules = RoutingRule.objects.filter(
        category_id=appeal.category_id,
        category__is_active=True,
        applicant_type=appeal.applicant_type,
        is_active=True,
        group__is_active=True,
    )
    experts = StaffUser.objects.filter(
        role="expert", is_active=True, specialist_groups__in=rules.values("group_id")
    ).distinct()
    result = []
    for user in experts.annotate(
        load=Count(
            "appealparticipant",
            filter=Q(
                appealparticipant__revoked_at__isnull=True,
                appealparticipant__appeal__status__in=ACTIVE,
            ),
            distinct=True,
        )
    ):
        result.append(
            {
                "id": user.pk,
                "username": user.username,
                "load": user.load,
                "limit": user.max_active_appeals,
                "available": user.load < user.max_active_appeals,
            }
        )
    result.sort(key=lambda item: (item["load"], item["id"]))
    proposed = next((item["id"] for item in result if item["available"]), None)
    return {
        "experts": result,
        "suggested_expert_id": proposed,
        "groups": list(rules.values_list("group__name", flat=True).distinct()),
        "state": "available" if proposed else "overloaded" if result else "no_expert",
    }


def suggestion(appeal: Appeal) -> dict[str, Any]:
    data = candidates(appeal)
    # A small deterministic hint, never an automatic category or priority update.
    keywords = {
        "bullying": ["трав", "оскорб"],
        "cyberbullying": ["интернет", "соцсет", "чат"],
        "threats": ["угроз", "давлен"],
        "teacher": ["учител"],
        "family": ["родител"],
        "legal": ["юрид", "закон"],
        "peers": ["однокласс", "конфликт"],
    }
    guessed = next(
        (
            key
            for key, words in keywords.items()
            if any(word in appeal.original_text.lower() for word in words)
        ),
        None,
    )
    if guessed and not Category.objects.filter(pk=guessed, is_active=True).exists():
        guessed = None
    data["suggested_category"] = guessed
    return data


@require_GET
@endpoint
def routing(request: HttpRequest, appeal_id: UUID) -> JsonResponse:
    user = require_staff(request)
    if user.role not in {"operator", "expert"}:
        raise APIError("forbidden", 403)
    appeal = Appeal.objects.filter(pk=appeal_id).first()
    if appeal is None:
        raise APIError("not_found", 404)
    if user.role == "expert":
        require_participant(appeal, Actor.staff(user))
    return JsonResponse(suggestion(appeal))


@require_GET
@endpoint
def alerts(request: HttpRequest) -> JsonResponse:
    user = require_staff(request)
    if user.role not in {"admin", "operator"}:
        raise APIError("forbidden", 403)
    rows = []
    for appeal in (
        Appeal.objects.filter(status__in=["new", "returned"])
        .only("id", "category_id", "applicant_type")
        .order_by("created_at")
    ):
        routing = candidates(appeal)
        if routing["state"] != "available":
            rows.append(
                {"id": str(appeal.pk), "category": appeal.category_id, "state": routing["state"]}
            )
    return JsonResponse({"alerts": rows})

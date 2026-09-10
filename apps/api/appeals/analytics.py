"""Metadata-only reporting. Explicit columns, scoped cohort and UTC half-open period."""

import csv
from collections import Counter
from datetime import UTC, date, datetime, time, timedelta
from io import StringIO
from typing import Any

from django.db.models import QuerySet
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_GET
from infrastructure.http import APIError, endpoint
from staff.models import StaffUser
from staff.sessions import require_staff

from appeals.models import Appeal, AppealParticipant
from appeals.transitions import ACTIVE

COLUMNS = [
    "id",
    "category_id",
    "applicant_type",
    "status",
    "priority",
    "return_count",
    "created_at",
    "operator_accepted_at",
    "first_response_at",
    "closed_at",
    "close_kind",
]


def scope(user: StaffUser) -> QuerySet[Appeal]:
    query = Appeal.objects.all()
    if user.role == "admin":
        return query
    if user.role == "operator":
        return query.filter(events__actor_staff=user, events__actor_role="operator").distinct()
    if user.role == "expert":
        return query.filter(participants__staff=user).distinct()
    raise APIError("forbidden", 403)


def cohort(request: HttpRequest, user: StaffUser) -> tuple[list[dict[str, Any]], str, str]:
    if set(request.GET) - {"from", "to"} or any(len(v) != 1 for _, v in request.GET.lists()):
        raise APIError("invalid_request")
    today = timezone.now().date()
    try:
        start = date.fromisoformat(
            request.GET.get("from", (today - timedelta(days=30)).isoformat())
        )
        end = date.fromisoformat(request.GET.get("to", (today + timedelta(days=1)).isoformat()))
    except ValueError:
        raise APIError("invalid_request") from None
    if not 0 < (end - start).days <= 366:
        raise APIError("invalid_request")
    rows = list(
        scope(user)
        .filter(
            created_at__gte=datetime.combine(start, time.min, UTC),
            created_at__lt=datetime.combine(end, time.min, UTC),
        )
        .order_by("created_at", "pk")
        .values(*COLUMNS)[:50001]
    )
    if len(rows) > 50000:
        raise APIError("report_too_large", 413)
    return rows, start.isoformat(), end.isoformat()


def interval(rows: list[dict[str, Any]], field: str) -> dict[str, Any]:
    values = [(r[field] - r["created_at"]).total_seconds() for r in rows if r[field] is not None]
    valid = [v for v in values if v >= 0]
    return {
        "mean_seconds": sum(valid) / len(valid) if valid else None,
        "n": len(valid),
        "missing": len(rows) - len(values),
        "invalid": len(values) - len(valid),
    }


def workload(user: StaffUser) -> list[dict[str, Any]]:
    staff = StaffUser.objects.filter(role__in=["operator", "expert"])
    if user.role != "admin":
        staff = staff.filter(pk=user.pk)
    result = []
    for person in staff.order_by("pk"):
        if person.role == "expert":
            count = AppealParticipant.objects.filter(
                staff=person, revoked_at__isnull=True, appeal__status__in=ACTIVE
            ).count()
        else:
            count = (
                Appeal.objects.filter(
                    status__in=ACTIVE, events__actor_staff=person, events__actor_role="operator"
                )
                .distinct()
                .count()
            )
        result.append(
            {
                "staff_id": person.pk,
                "username": person.username,
                "role": person.role,
                "active_count": count,
                "limit": person.max_active_appeals if person.role == "expert" else None,
            }
        )
    return result


@require_GET
@endpoint
def report(request: HttpRequest) -> JsonResponse:
    user = require_staff(request)
    rows, start, end = cohort(request, user)
    count = len(rows)
    urgent = sum(r["priority"] == "urgent" for r in rows)
    returned = sum(r["return_count"] > 0 for r in rows)
    return JsonResponse(
        {
            "from": start,
            "to": end,
            "scope": "all" if user.role == "admin" else "own",
            "total": count,
            "distributions": {
                key: dict(Counter(r[field] for r in rows))
                for key, field in [
                    ("categories", "category_id"),
                    ("applicant_types", "applicant_type"),
                    ("statuses", "status"),
                    ("close_kinds", "close_kind"),
                ]
            },
            "times": {
                name: interval(rows, field)
                for name, field in [
                    ("operator", "operator_accepted_at"),
                    ("first_response", "first_response_at"),
                    ("closure", "closed_at"),
                ]
            },
            "urgent": {"count": urgent, "ratio": urgent / count if count else None},
            "returned": {"count": returned, "ratio": returned / count if count else None},
            "workload": workload(user),
        }
    )


def csv_value(value: Any) -> str:
    if value is None:
        return ""
    text = value.isoformat() if isinstance(value, datetime) else str(value)
    # Defence even for historical/imported category keys or malformed DB metadata.
    return (
        "'" + text
        if text.lstrip().startswith(("=", "+", "-", "@")) or text.startswith(("\t", "\r", "\n"))
        else text
    )


@require_GET
@endpoint
def export(request: HttpRequest) -> HttpResponse:
    user = require_staff(request)
    rows, _, _ = cohort(request, user)
    out = StringIO()
    writer = csv.writer(out)
    writer.writerow(COLUMNS)
    for row in rows:
        writer.writerow([csv_value(row[key]) for key in COLUMNS])
    response = HttpResponse("\ufeff" + out.getvalue(), content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = 'attachment; filename="otklik-metadata.csv"'
    response["X-Content-Type-Options"] = "nosniff"
    return response

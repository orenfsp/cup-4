from django.db import transaction
from django.http import HttpRequest, JsonResponse
from django.middleware.csrf import get_token, rotate_token
from django.views.decorators.http import require_GET, require_POST
from infrastructure.http import APIError, endpoint, payload
from infrastructure.limiter import rate_limit
from infrastructure.tokens import session_cookie, session_digest

from staff import sessions
from staff.models import StaffSession, StaffUser


@require_GET
def csrf(request: HttpRequest) -> JsonResponse:
    return JsonResponse({"csrf_token": get_token(request)})


@require_POST
@endpoint
def login(request: HttpRequest) -> JsonResponse:
    rate_limit(request, "staff_login", 5, 60)
    data = payload(request, "login")
    user = sessions.authenticate(data["username"], data["password"])
    with transaction.atomic():
        current = StaffUser.objects.select_for_update().get(pk=user.pk)
        if not current.is_active or sessions.fingerprint(current) != sessions.fingerprint(user):
            raise APIError("invalid_credentials", 401)
        token = sessions.create_session(current, request.COOKIES.get(sessions.COOKIE, ""))
    rotate_token(request)
    response = JsonResponse(
        {
            "user": {"id": user.pk, "username": user.username, "role": user.role},
            "csrf_token": get_token(request),
        }
    )
    session_cookie(response, sessions.COOKIE, token, sessions.COOKIE_PATH, sessions.TTL)
    return response


@require_GET
@endpoint
def me(request: HttpRequest) -> JsonResponse:
    user = sessions.require_staff(request)
    return JsonResponse({"user": {"id": user.pk, "username": user.username, "role": user.role}})


@require_POST
@endpoint
def logout(request: HttpRequest) -> JsonResponse:
    payload(request, "empty")
    StaffSession.objects.filter(
        token_digest=session_digest(request.COOKIES.get(sessions.COOKIE, ""))
    ).delete()
    response = JsonResponse({"status": "ok"})
    response.delete_cookie(sessions.COOKIE, path=sessions.COOKIE_PATH, samesite="Lax")
    return response

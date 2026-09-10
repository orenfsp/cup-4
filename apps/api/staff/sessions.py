import secrets
from datetime import timedelta

from django.contrib.auth.hashers import check_password, make_password
from django.http import HttpRequest
from django.utils import timezone
from django.utils.crypto import constant_time_compare
from infrastructure.http import APIError
from infrastructure.tokens import digest, new_token, session_digest

from staff.models import StaffSession, StaffUser

COOKIE = "otklik_staff"
COOKIE_PATH = "/api/staff/"
TTL = 8 * 60 * 60
DUMMY_PASSWORD = make_password(secrets.token_urlsafe(32))


def fingerprint(user: StaffUser) -> str:
    return digest(user.get_session_auth_hash() + ":" + user.role)


def authenticate(username: str, password: str) -> StaffUser:
    user = StaffUser.objects.filter(username=username).first()
    valid = check_password(password, user.password if user else DUMMY_PASSWORD)
    if (
        not user
        or not valid
        or not user.is_active
        or user.role not in {"operator", "expert", "admin"}
    ):
        raise APIError("invalid_credentials", 401)
    return user


def create_session(user: StaffUser, previous: str) -> str:
    StaffSession.objects.filter(token_digest=session_digest(previous)).delete()
    token = new_token()
    StaffSession.objects.create(
        token_digest=digest(token),
        user=user,
        auth_fingerprint=fingerprint(user),
        expires_at=timezone.now() + timedelta(seconds=TTL),
    )
    return token


def require_staff(request: HttpRequest) -> StaffUser:
    session = (
        StaffSession.objects.select_related("user")
        .filter(
            token_digest=session_digest(request.COOKIES.get(COOKIE, "")),
            expires_at__gt=timezone.now(),
            user__is_active=True,
        )
        .first()
    )
    if session is None or not constant_time_compare(
        session.auth_fingerprint, fingerprint(session.user)
    ):
        raise APIError("authentication_required", 401)
    return session.user

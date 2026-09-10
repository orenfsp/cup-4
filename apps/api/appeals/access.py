import secrets
from datetime import timedelta

from django.http import HttpRequest
from django.utils import timezone
from infrastructure.http import APIError
from infrastructure.tokens import digest, new_token, session_digest

from appeals.models import Appeal, AppealSession

ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
COOKIE = "otklik_appeal"
COOKIE_PATH = "/api/applicant/"
TTL = 12 * 60 * 60


def generate_code() -> str:
    raw = "".join(secrets.choice(ALPHABET) for _ in range(16))
    return "ОТК-" + "-".join(raw[i : i + 4] for i in range(0, 16, 4))


def code_digest(code: str) -> str:
    raw = code.upper().replace("-", "").replace(" ", "")
    if raw.startswith("ОТК"):
        raw = raw[3:]
    if len(raw) != 16 or any(char not in ALPHABET for char in raw):
        return ""  # Still perform the same indexed lookup and return the same HTTP error.
    return digest(raw)


def create_session(appeal: Appeal, previous: str) -> str:
    AppealSession.objects.filter(token_digest=session_digest(previous)).delete()
    token = new_token()
    AppealSession.objects.create(
        token_digest=digest(token),
        appeal=appeal,
        expires_at=timezone.now() + timedelta(seconds=TTL),
    )
    return token


def require_appeal_session(request: HttpRequest) -> AppealSession:
    session = AppealSession.objects.filter(
        token_digest=session_digest(request.COOKIES.get(COOKIE, "")), expires_at__gt=timezone.now()
    ).first()
    if session is None:
        raise APIError("authentication_required", 401)
    return session

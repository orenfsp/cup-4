import hashlib
import re
import secrets

from django.conf import settings
from django.http import JsonResponse

SESSION_TOKEN = re.compile(r"[A-Za-z0-9_-]{43}\Z")


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def session_digest(value: str) -> str:
    return digest(value) if SESSION_TOKEN.fullmatch(value) else ""


def new_token() -> str:
    return secrets.token_urlsafe(32)


def session_cookie(response: JsonResponse, name: str, token: str, path: str, seconds: int) -> None:
    response.set_cookie(
        name,
        token,
        max_age=seconds,
        path=path,
        secure=settings.SESSION_COOKIE_SECURE,
        httponly=True,
        samesite="Lax",
    )

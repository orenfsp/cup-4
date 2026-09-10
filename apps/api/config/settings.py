import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured


def secret(name: str) -> str:
    file_name = os.environ.get(f"{name}_FILE")
    value = Path(file_name).read_text().strip() if file_name else os.environ.get(name, "")
    if not value:
        raise ImproperlyConfigured(f"Set {name} or {name}_FILE")
    return value


SECRET_KEY = secret("DJANGO_SECRET_KEY")
DEBUG = False
ALLOWED_HOSTS = os.environ.get("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")
INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "staff",
    "routing",
    "appeals",
    "health",
]
AUTH_USER_MODEL = "staff.StaffUser"
DEMO_MODE = os.environ.get("DEMO_MODE", "0") == "1"
DATA_UPLOAD_MAX_MEMORY_SIZE = 64 * 1024
CSRF_FAILURE_VIEW = "infrastructure.http.csrf_failure"
TRUSTED_PROXY_IPS = [item for item in os.environ.get("TRUSTED_PROXY_IPS", "").split(",") if item]
TRUSTED_PROXY_HOSTS = [
    item for item in os.environ.get("TRUSTED_PROXY_HOSTS", "").split(",") if item
]
MIDDLEWARE = [
    "infrastructure.logging.SafeAPIMiddleware",
    "infrastructure.uploads.BoundedBodyMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]
ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("POSTGRES_DB", "otklik"),
        "USER": os.environ.get("POSTGRES_USER", "otklik"),
        "PASSWORD": secret("POSTGRES_PASSWORD"),
        "HOST": os.environ.get("POSTGRES_HOST", "db"),
        "PORT": os.environ.get("POSTGRES_PORT", "5432"),
        "OPTIONS": {"connect_timeout": 3},
        "CONN_MAX_AGE": 0,
    }
}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
LANGUAGE_CODE = "ru"
TIME_ZONE = "UTC"
USE_TZ = True
APPEND_SLASH = False
SESSION_COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "1") == "1"
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SECURE = SESSION_COOKIE_SECURE
CSRF_COOKIE_SAMESITE = "Lax"
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "no-referrer"
X_FRAME_OPTIONS = "DENY"
# Only route names, numeric HTTP status and duration may enter request logs.
LOGGING = {
    "version": 1,
    "disable_existing_loggers": True,
    "handlers": {
        "null": {"class": "logging.NullHandler"},
        "safe_console": {"class": "logging.StreamHandler"},
    },
    "root": {"handlers": ["null"]},
    "loggers": {
        "django": {"handlers": ["null"], "propagate": False},
        "otklik.requests": {"handlers": ["safe_console"], "level": "INFO", "propagate": False},
    },
}

CONTACT_KEY = secret("CONTACT_KEY")
PRIVATE_ATTACHMENTS_ROOT = Path(os.environ.get("PRIVATE_ATTACHMENTS_ROOT", "/private/attachments"))
# Entire request bounded before CSRF parses multipart, including chunked bodies.
FILE_UPLOAD_MAX_MEMORY_SIZE = 11_000_000
DATA_UPLOAD_MAX_NUMBER_FILES = 5
# Also applies to GET parameters (the staff queue sends five filters).
DATA_UPLOAD_MAX_NUMBER_FIELDS = 32

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
CSRF_TRUSTED_ORIGINS = ["https://otklik.zdarovailya.online"]

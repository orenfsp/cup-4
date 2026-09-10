import secrets
from io import BytesIO
from pathlib import Path
from typing import Any

from django.conf import settings
from infrastructure.http import APIError
from PIL import Image, ImageOps, UnidentifiedImageError

MAX_TOTAL = 10_000_000
MAX_FILES = 5
ALLOWED = {"image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WEBP"}


def clean_upload(upload: Any) -> tuple[bytes, str]:
    if upload.size > MAX_TOTAL:
        raise APIError("attachment_too_large", 413)
    try:
        with Image.open(upload) as image:
            if image.format not in ALLOWED.values() or image.width * image.height > 20_000_000:
                raise APIError("attachment_invalid")
            image.load()
            work = ImageOps.exif_transpose(image)
            mode = "RGBA" if "A" in work.getbands() else "RGB"
            clean = Image.new(mode, work.size)
            clean.paste(work.convert(mode))
            output = BytesIO()
            clean.save(output, format="PNG", optimize=True)
            data = output.getvalue()
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
        raise APIError("attachment_invalid") from exc
    if len(data) > MAX_TOTAL:
        raise APIError("attachment_too_large", 413)
    return data, "image/png"


def store_upload(upload: Any) -> tuple[str, int, str]:
    data, content_type = clean_upload(upload)
    root = Path(settings.PRIVATE_ATTACHMENTS_ROOT)
    root.mkdir(parents=True, exist_ok=True)
    key = secrets.token_urlsafe(32)
    path = root / key
    path.write_bytes(data)
    path.chmod(0o600)
    return key, len(data), content_type


def remove(key: str) -> None:
    path = Path(settings.PRIVATE_ATTACHMENTS_ROOT) / key
    try:
        path.unlink()
    except FileNotFoundError:
        pass

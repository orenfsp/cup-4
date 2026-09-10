import json
import re
import unicodedata
from pathlib import Path
from typing import Any

from cryptography.fernet import Fernet
from django.conf import settings
from django.utils import timezone
from otklik_contracts import CRISIS_RULES

from appeals.models import Appeal, CrisisContact


def normalize(value: str) -> str:
    return re.sub(
        r"\s+", " ", unicodedata.normalize("NFKC", value).lower().replace("ё", "е")
    ).strip()


def detect(text: str, answers: dict[str, Any] | None = None) -> list[str]:
    value = normalize(text)
    codes = [
        f"text:{index}"
        for index, phrase in enumerate(CRISIS_RULES["phrases"])
        if normalize(phrase) in value
    ]
    for answer in (answers or {}).get("safety", "").split(","):
        if answer in CRISIS_RULES["answers"]["safety"]:
            codes.append(f"answer:{answer}")
    return codes


def mark(appeal: Appeal, codes: list[str]) -> None:
    if not codes:
        return
    merged = list(dict.fromkeys([*(appeal.crisis_codes or []), *codes]))
    appeal.is_crisis = True
    appeal.crisis_codes = merged
    if appeal.crisis_detected_at is None:
        appeal.crisis_detected_at = timezone.now()
    appeal.save(update_fields=["is_crisis", "crisis_codes", "crisis_detected_at", "updated_at"])


def encrypt_contact(value: str) -> bytes:
    return Fernet(settings.CONTACT_KEY.encode()).encrypt(value.strip().encode())


def decrypt_contact(contact: CrisisContact) -> str:
    return Fernet(settings.CONTACT_KEY.encode()).decrypt(bytes(contact.encrypted_value)).decode()


def approved_contacts() -> dict[str, Any]:
    path = Path(__file__).with_name("help-contacts.json")
    return json.loads(path.read_text())

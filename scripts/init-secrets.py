"""First-run local Compose secrets. Never print their contents."""

import base64
import os
import secrets
from pathlib import Path

root = Path("/secrets")
for name in ("django_key", "database_password", "contact_key"):
    path = root / name
    if not path.exists():
        with path.open("x") as stream:
            stream.write(
                base64.urlsafe_b64encode(secrets.token_bytes(32)).decode()
                if name == "contact_key"
                else secrets.token_urlsafe(48)
            )
        os.chown(path, 10001, 10001)
        path.chmod(0o400)

attachments = Path("/private/attachments")
attachments.mkdir(parents=True, exist_ok=True)
os.chown(attachments, 10001, 10001)
attachments.chmod(0o700)

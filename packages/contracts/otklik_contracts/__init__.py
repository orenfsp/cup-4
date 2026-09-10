"""Language-neutral public contracts. Never import server models here."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENUMS: dict[str, dict[str, str]] = json.loads((ROOT / "enums.json").read_text())
HEALTH_SCHEMA = json.loads((ROOT / "health.schema.json").read_text())

API_SCHEMAS = json.loads((ROOT / "api.schemas.json").read_text())
for schema in API_SCHEMAS.values():
    schema["$defs"] = {name: {"enum": list(values)} for name, values in ENUMS.items()}

QUESTIONS = json.loads((ROOT / "questions.json").read_text())

CRISIS_RULES = json.loads((ROOT / "crisis.rules.json").read_text())

from typing import Any

from django.core.management.base import BaseCommand
from infrastructure.http import APIError

from appeals.models import Appeal
from appeals.policies import Actor
from appeals.services import apply_action


class Command(BaseCommand):
    help = "Close needs_info/answer_ready appeals after seven days without applicant activity."

    def handle(self, *args: Any, **options: Any) -> None:
        count = 0
        for appeal in Appeal.objects.filter(status__in=["needs_info", "answer_ready"]).iterator():
            try:
                apply_action(
                    appeal.id,
                    Actor("system"),
                    {
                        "action": "expire",
                        "expected_version": appeal.version,
                        "reason": "Автоматическое закрытие после 7 дней без ответа",
                    },
                )
                count += 1
            except APIError as error:
                if error.code not in {"invalid_transition", "version_conflict"}:
                    raise
        self.stdout.write(f"closed={count}")

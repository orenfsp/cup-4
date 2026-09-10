from typing import Any

from appeals.models import AppealSession
from django.core.management.base import BaseCommand
from django.utils import timezone

from staff.models import StaffSession


class Command(BaseCommand):
    help = "Delete expired session verifiers without printing identifiers."

    def handle(self, *args: Any, **options: Any) -> None:
        now = timezone.now()
        staff, _ = StaffSession.objects.filter(expires_at__lte=now).delete()
        applicant, _ = AppealSession.objects.filter(expires_at__lte=now).delete()
        self.stdout.write(f"Expired sessions removed: staff={staff}, applicant={applicant}")

from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from otklik_contracts import ENUMS
from routing.models import Category, RoutingRule, SpecialistGroup

from staff.models import StaffUser

DEMO_PASSWORD = "DemoOnly-Otklik-2026!"


class Command(BaseCommand):
    help = "Explicit test-only staff and routing data. Requires DEMO_MODE=1."

    @transaction.atomic
    def handle(self, *args: Any, **options: Any) -> None:
        if not settings.DEMO_MODE:
            raise CommandError("Demo seed is disabled. Set DEMO_MODE=1 for this command only.")
        accounts = [
            ("demo-operator", "operator"),
            ("demo-expert", "expert"),
            ("demo-admin", "admin"),
            ("demo-expert-2", "expert"),
        ]
        experts = []
        for username, role in accounts:
            user, created = StaffUser.objects.get_or_create(
                username=username, defaults={"role": role, "is_demo": True}
            )
            if not user.is_demo:
                raise CommandError("A non-demo account already uses a reserved demo username.")
            if created:
                user.set_password(DEMO_PASSWORD)
                user.save(update_fields=["password"])
            if role == "expert":
                experts.append(user)
        group, created = SpecialistGroup.objects.get_or_create(name="Демо: психологи")
        if created:
            group.members.add(*experts)
        else:
            # Add only explicitly demo experts; preserve all existing memberships.
            group.members.add(*experts)
        legal, _ = SpecialistGroup.objects.get_or_create(name="Демо: юристы")
        legal.members.add(experts[1])
        category, _ = Category.objects.get_or_create(
            slug="demo-conflict", defaults={"name": "Демо: конфликт"}
        )
        for item in Category.objects.filter(is_active=True):
            for applicant_type in ENUMS["applicantTypes"]:
                RoutingRule.objects.get_or_create(
                    category=item, group=group, applicant_type=applicant_type
                )
                RoutingRule.objects.get_or_create(
                    category=item, group=legal, applicant_type=applicant_type
                )
        self.stdout.write(
            "Demo accounts and rules are ready. Credentials are documented in README; "
            "existing passwords are unchanged."
        )

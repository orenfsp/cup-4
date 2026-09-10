from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models
from otklik_contracts import ENUMS


class StaffUser(AbstractUser):
    role = models.CharField(max_length=16, choices=ENUMS["staffRoles"])
    max_active_appeals = models.PositiveSmallIntegerField(default=10)
    is_demo = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=models.Q(role__in=list(ENUMS["staffRoles"])), name="staff_valid_role"
            ),
            models.CheckConstraint(
                condition=models.Q(max_active_appeals__gte=1), name="staff_positive_capacity"
            ),
        ]


class StaffSession(models.Model):
    token_digest = models.CharField(max_length=64, primary_key=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    auth_fingerprint = models.CharField(max_length=64)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(db_index=True)

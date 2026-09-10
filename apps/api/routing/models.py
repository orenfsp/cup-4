from django.conf import settings
from django.db import models
from otklik_contracts import ENUMS


class Category(models.Model):
    slug = models.SlugField(primary_key=True, max_length=64)
    name = models.CharField(max_length=120)
    is_active = models.BooleanField(default=True)


class SpecialistGroup(models.Model):
    name = models.CharField(max_length=120, unique=True)
    is_active = models.BooleanField(default=True)
    members = models.ManyToManyField(settings.AUTH_USER_MODEL, related_name="specialist_groups")


class RoutingRule(models.Model):
    category = models.ForeignKey(Category, on_delete=models.PROTECT)
    group = models.ForeignKey(SpecialistGroup, on_delete=models.PROTECT)
    applicant_type = models.CharField(max_length=16, choices=ENUMS["applicantTypes"])
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["category", "group", "applicant_type"], name="routing_unique_rule"
            ),
            models.CheckConstraint(
                condition=models.Q(applicant_type__in=list(ENUMS["applicantTypes"])),
                name="routing_valid_applicant",
            ),
        ]


class ServicePolicy(models.Model):
    id = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    version = models.PositiveIntegerField(default=0)
    return_limit = models.PositiveSmallIntegerField(default=2)
    operator_wait_hours = models.PositiveSmallIntegerField(default=2)
    expert_wait_hours = models.PositiveSmallIntegerField(default=24)
    auto_close_days = models.PositiveSmallIntegerField(default=7)


class ConfigurationEvent(models.Model):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    resource = models.CharField(max_length=16)
    target = models.CharField(max_length=64)
    version = models.PositiveIntegerField(unique=True)
    reason = models.CharField(max_length=2000)
    created_at = models.DateTimeField(auto_now_add=True)

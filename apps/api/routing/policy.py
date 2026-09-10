from routing.models import ServicePolicy


def policy() -> ServicePolicy:
    # Seeded by migration. get_or_create also supports flushed test databases.
    return ServicePolicy.objects.get_or_create(pk=1)[0]


def lock_policy() -> ServicePolicy:
    policy()
    return ServicePolicy.objects.select_for_update().get(pk=1)

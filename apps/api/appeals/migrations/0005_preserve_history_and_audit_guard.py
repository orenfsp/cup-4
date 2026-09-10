from django.db import migrations


def preserve_existing(apps, schema_editor):
    Appeal = apps.get_model("appeals", "Appeal")
    Event = apps.get_model("appeals", "AppealEvent")
    for appeal in Appeal.objects.using(schema_editor.connection.alias).iterator():
        Event.objects.using(schema_editor.connection.alias).get_or_create(
            appeal_id=appeal.pk,
            version=appeal.version,
            defaults={
                "actor_role": "system",
                "action": "import_stage1",
                "from_status": "",
                "to_status": appeal.status,
                "priority": appeal.priority,
            },
        )


class Migration(migrations.Migration):
    dependencies = [("appeals", "0004_appealevent_actor_staff_appealevent_appeal_and_more")]
    operations = [
        migrations.RunPython(preserve_existing, migrations.RunPython.noop),
        migrations.RunSQL(
            sql="""
                CREATE FUNCTION otklik_immutable_appeal_event() RETURNS trigger AS $$
                BEGIN
                    RAISE EXCEPTION 'Appeal events are append-only' USING ERRCODE = '23514';
                END;
                $$ LANGUAGE plpgsql;
                CREATE TRIGGER otklik_event_guard BEFORE UPDATE OR DELETE ON appeals_appealevent
                FOR EACH ROW EXECUTE FUNCTION otklik_immutable_appeal_event();
            """,
            reverse_sql="""
                DROP TRIGGER otklik_event_guard ON appeals_appealevent;
                DROP FUNCTION otklik_immutable_appeal_event();
            """,
        ),
    ]

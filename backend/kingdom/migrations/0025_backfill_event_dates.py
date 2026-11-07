from datetime import UTC, datetime, timedelta

from django.db import migrations

# event_templates.NOT_PLANNED as it is on 7. 11. 2026: the start of an irregular event that has no date yet
NOT_PLANNED = datetime(2026, 10, 1, 18, tzinfo=UTC)


def backfill(apps, schema_editor):
    """The dates irregular events had before their history was kept (Gether 7. 11. 2026): their current date, the
    dates of the Discord channel messages planned for them and the dates leadership gave a type – whatever is left."""
    KingdomEvent = apps.get_model('kingdom', 'KingdomEvent')
    EventDate = apps.get_model('kingdom', 'EventDate')
    EventNotification = apps.get_model('kingdom', 'EventNotification')
    EventRun = apps.get_model('kingdom', 'EventRun')
    for event in KingdomEvent.objects.filter(irregular=True):
        starts = {event.starts_at}
        starts |= set(
            EventNotification.objects.filter(event=event, occurrence_start__isnull=False).values_list(
                'occurrence_start', flat=True
            )
        )
        starts |= set(EventRun.objects.filter(event=event).values_list('start', flat=True))
        for start in starts:
            if abs(start - NOT_PLANNED) <= timedelta(days=1):
                continue
            end = start + timedelta(minutes=event.duration_minutes) if event.duration_minutes else None
            EventDate.objects.get_or_create(event=event, start=start, defaults={'end': end})


class Migration(migrations.Migration):
    dependencies = [
        ('kingdom', '0024_event_dates'),
    ]

    operations = [migrations.RunPython(backfill, migrations.RunPython.noop)]

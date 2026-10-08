from datetime import UTC, datetime

from django.db import migrations

EGG = 'Hunt for History (vajce)'
HAMMER = 'Hunt for History (kladivo)'


def split(apps, schema_editor):
    """Hunt for History takes turns: hammer from 16. 10. 2026, egg from 30. 10., each every four weeks (Gether).

    Only the event as it was seeded (every 14 days) is changed – one edited in the admin stays as it is.
    """
    KingdomEvent = apps.get_model('kingdom', 'KingdomEvent')
    EventNotification = apps.get_model('kingdom', 'EventNotification')
    event = KingdomEvent.objects.filter(name_sk=EGG, repeat_days=14).first()
    if event is None or KingdomEvent.objects.filter(name_sk=HAMMER).exists():
        return
    # reminders planned for the old two-week cycle; the worker plans the new ones
    EventNotification.objects.filter(event=event, status='pending').delete()
    egg_start = datetime(2026, 10, 30, tzinfo=UTC)
    egg = KingdomEvent.objects.get(pk=event.pk)
    egg.pk = None
    egg.starts_at = egg_start
    egg.repeat_days = 28
    egg.save()
    event.name_sk = HAMMER
    event.name_cs = ''
    event.repeat_days = 28
    event.save()


class Migration(migrations.Migration):
    dependencies = [
        ('kingdom', '0007_icons_from_screenshots'),
    ]

    operations = [
        migrations.RunPython(split, migrations.RunPython.noop),
    ]

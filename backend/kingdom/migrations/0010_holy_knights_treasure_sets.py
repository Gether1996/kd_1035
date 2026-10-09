from datetime import UTC, datetime

from django.db import migrations

EGG = "Holy Knight's Treasure"

# the egg cycles through three equipment sets, each set every 12 weeks (Gether, 9. 10. 2026: the last egg was
# weapon + accessories, so the next one is chest, gloves and boots)
SETS = [
    ("Holy Knight's Treasure – hruď, rukavice, topánky", "Holy Knight's Treasure – hruď, rukavice, boty",
     datetime(2026, 10, 30, tzinfo=UTC)),
    ("Holy Knight's Treasure – prilba, nohavice", "Holy Knight's Treasure – helma, kalhoty",
     datetime(2026, 11, 27, tzinfo=UTC)),
    ("Holy Knight's Treasure – zbraň, doplnky", "Holy Knight's Treasure – zbraň, doplňky",
     datetime(2026, 12, 25, tzinfo=UTC)),
]  # fmt: skip


def split(apps, schema_editor):
    """Only the event as 0009 left it (every four weeks) is split – one edited in the admin stays as it is."""
    KingdomEvent = apps.get_model('kingdom', 'KingdomEvent')
    EventNotification = apps.get_model('kingdom', 'EventNotification')
    event = KingdomEvent.objects.filter(name_sk=EGG, repeat_days=28).first()
    if event is None:
        return
    # reminders planned for the old four-week cycle; the worker plans the new ones
    EventNotification.objects.filter(event=event, status='pending').delete()
    for index, (name_sk, name_cs, start) in enumerate(SETS):
        # the first set keeps the event (and the players' reminders of it), the others are copies
        copy = event if index == 0 else KingdomEvent.objects.get(pk=event.pk)
        if index:
            copy.pk = None
        copy.name_sk, copy.name_cs, copy.starts_at, copy.repeat_days = name_sk, name_cs, start, 84
        copy.save()


class Migration(migrations.Migration):
    dependencies = [
        ('kingdom', '0009_holy_knights_treasure'),
    ]

    operations = [
        migrations.RunPython(split, migrations.RunPython.noop),
    ]

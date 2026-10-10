"""Game events (00:00 UTC) remind the evening before at 18:00 our time instead of 1–2 am (Gether, 10. 10. 2026).

Only events that still have the old defaults change: Discord 1 day before, players offered 1 h and 1 day. The
pending Discord reminders planned from the old definition go – the worker plans the new ones within minutes.
"""

from django.db import migrations

EVENING_BEFORE = -18 * 60
OLD = ([1440], [60, 1440])
NEW = ([EVENING_BEFORE], [EVENING_BEFORE, 180])


def forwards(apps, schema_editor):
    KingdomEvent = apps.get_model('kingdom', 'KingdomEvent')
    EventNotification = apps.get_model('kingdom', 'EventNotification')
    for event in KingdomEvent.objects.filter(time_basis='utc'):
        if (event.reminders, event.player_reminders) != OLD:
            continue
        event.reminders, event.player_reminders = NEW
        event.save(update_fields=['reminders', 'player_reminders'])
        EventNotification.objects.filter(event=event, status='pending', offset_minutes=1440).delete()


def backwards(apps, schema_editor):
    KingdomEvent = apps.get_model('kingdom', 'KingdomEvent')
    EventNotification = apps.get_model('kingdom', 'EventNotification')
    for event in KingdomEvent.objects.filter(time_basis='utc'):
        if (event.reminders, event.player_reminders) == NEW:
            event.reminders, event.player_reminders = OLD
            event.save(update_fields=['reminders', 'player_reminders'])
            EventNotification.objects.filter(event=event, status='pending', offset_minutes=EVENING_BEFORE).delete()


class Migration(migrations.Migration):
    dependencies = [('kingdom', '0012_reminder_offset_evening')]

    operations = [migrations.RunPython(forwards, backwards)]

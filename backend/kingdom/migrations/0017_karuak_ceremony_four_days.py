from datetime import UTC, datetime

from django.db import migrations

# Karuak Ceremony runs four days: the in-game calendar "UTC 2026/10/14 - 2026/10/17" includes the last day, so it
# ends at 00:00 UTC on 18. 10. (Gether's screenshot, 13. 10. 2026). 0014 created it with three days. Only the
# untouched row changes – a date or length set by hand in the admin stays.
NAME = 'Karuak Ceremony'
DAY = 24 * 60


def four_days(apps, schema_editor):
    KingdomEvent = apps.get_model('kingdom', 'KingdomEvent')
    EventNotification = apps.get_model('kingdom', 'EventNotification')
    karuak = KingdomEvent.objects.filter(
        name_sk=NAME, starts_at=datetime(2026, 10, 14, tzinfo=UTC), duration_minutes=3 * DAY
    )
    # the worker plans pending notifications again (a message with {end} carries the old end)
    EventNotification.objects.filter(event__in=karuak, status='pending').delete()
    karuak.update(duration_minutes=4 * DAY)


class Migration(migrations.Migration):
    dependencies = [('kingdom', '0016_karuak_icon')]

    operations = [migrations.RunPython(four_days, migrations.RunPython.noop)]

from datetime import UTC, datetime

from django.db import migrations

# Karuak Ceremony: an irregular event of several days, like Alliance Mobilization (Gether, 10. 10. 2026). The first
# date from his screenshot of the in-game calendar: UTC 2026/10/14 – 2026/10/17. Karuak Boss (an evening fight at
# 20:00 our time) stays a separate event.
NAME = 'Karuak Ceremony'
EVENING_BEFORE = -18 * 60


def create(apps, schema_editor):
    KingdomEvent = apps.get_model('kingdom', 'KingdomEvent')
    # an empty database (a new server, tests) gets its events from initial_events.json after the migrations
    if not KingdomEvent.objects.exists() or KingdomEvent.objects.filter(name_sk=NAME).exists():
        return
    KingdomEvent.objects.create(
        name_sk=NAME,
        icon='ceroli',
        message='**{name}** začína {start} ({relative}).',
        starts_at=datetime(2026, 10, 14, tzinfo=UTC),
        duration_minutes=3 * 24 * 60,
        irregular=True,
        time_basis='utc',
        # 00:00 UTC is at night here: the evening before at 18:00 our time
        reminders=[EVENING_BEFORE],
        player_reminders=[EVENING_BEFORE, 180],
    )


class Migration(migrations.Migration):
    dependencies = [('kingdom', '0013_game_events_evening_before')]

    operations = [migrations.RunPython(create, migrations.RunPython.noop)]

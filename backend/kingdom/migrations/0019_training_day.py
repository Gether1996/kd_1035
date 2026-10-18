from datetime import UTC, datetime, timedelta

from django.db import migrations

# 20 GH runs as different contests. Training Day: the top reward takes 8 100 minutes of speedups used on training
# troops, and the run of Fri–Sat 16.–17. 10. 2026 was one (Gether, 18. 10. 2026). Only the event called "20 GH";
# the run is tagged only when it really is one of its dates (a date moved in the admin stays without a type).
NAME = '20 GH'
RUN = datetime(2026, 10, 16, tzinfo=UTC)
TRAINING_DAY = {
    'name_sk': 'Training Day',
    'name_cs': '',
    'icon': 'training-day',
    'max_reward_sk': '8 100 minút speedov na tréning jednotiek',
    'max_reward_cs': '8 100 minut speedů na trénink jednotek',
}


def runs_on(event, moment) -> bool:
    if event.starts_at == moment:
        return True
    if not event.repeat_days or moment < event.starts_at or event.time_basis != 'utc':
        return False
    return (moment - event.starts_at) % timedelta(days=event.repeat_days) == timedelta(0)


def training_day(apps, schema_editor):
    KingdomEvent = apps.get_model('kingdom', 'KingdomEvent')
    EventVariant = apps.get_model('kingdom', 'EventVariant')
    EventRun = apps.get_model('kingdom', 'EventRun')
    for event in KingdomEvent.objects.filter(name_sk=NAME):
        variant, _ = EventVariant.objects.get_or_create(
            event=event, name_sk=TRAINING_DAY['name_sk'], defaults=TRAINING_DAY
        )
        if runs_on(event, RUN):
            EventRun.objects.get_or_create(event=event, start=RUN, defaults={'variant': variant})


class Migration(migrations.Migration):
    dependencies = [('kingdom', '0018_event_variants')]

    operations = [migrations.RunPython(training_day, migrations.RunPython.noop)]

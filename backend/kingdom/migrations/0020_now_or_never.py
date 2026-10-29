from datetime import UTC, datetime
from importlib import import_module

from django.db import migrations

# The second type of 20 GH: Now Or Never, the run of Fri–Sat 30.–31. 10. 2026 (Gether's screenshot of the game's
# event list, 29. 10. 2026). The top reward is not known yet – Gether fills it in in the admin. Only the event called
# "20 GH", the run tagged only when it really is one of its dates and has no type yet.
NAME = '20 GH'
RUN = datetime(2026, 10, 30, tzinfo=UTC)
NOW_OR_NEVER = {
    'name_sk': 'Now Or Never',
    'name_cs': '',
    'icon': 'now-or-never',
    'max_reward_sk': '',
    'max_reward_cs': '',
}
runs_on = import_module('kingdom.migrations.0019_training_day').runs_on


def now_or_never(apps, schema_editor):
    KingdomEvent = apps.get_model('kingdom', 'KingdomEvent')
    EventVariant = apps.get_model('kingdom', 'EventVariant')
    EventRun = apps.get_model('kingdom', 'EventRun')
    for event in KingdomEvent.objects.filter(name_sk=NAME):
        variant, _ = EventVariant.objects.get_or_create(
            event=event, name_sk=NOW_OR_NEVER['name_sk'], defaults=NOW_OR_NEVER
        )
        if runs_on(event, RUN):
            EventRun.objects.get_or_create(event=event, start=RUN, defaults={'variant': variant})


class Migration(migrations.Migration):
    dependencies = [('kingdom', '0019_training_day')]

    operations = [migrations.RunPython(now_or_never, migrations.RunPython.noop)]

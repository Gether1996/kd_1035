from datetime import UTC, datetime
from importlib import import_module

from django.db import migrations

# The third type of 20 GH: Lord of War, the run of Fri–Sat 13.–14. 11. 2026 (Gether's screenshot of the game's event
# list, 12. 11. 2026); the top reward is 420 000 power (Gether, the same day). Only the event called
# "20 GH", the run tagged only when it really is one of its dates and has no type yet.
NAME = '20 GH'
RUN = datetime(2026, 11, 13, tzinfo=UTC)
LORD_OF_WAR = {
    'name_sk': 'Lord of War',
    'name_cs': '',
    'icon': 'lord-of-war',
    'max_reward_sk': '420 000 power',
    'max_reward_cs': '420 000 power',
}
runs_on = import_module('kingdom.migrations.0019_training_day').runs_on


def lord_of_war(apps, schema_editor):
    KingdomEvent = apps.get_model('kingdom', 'KingdomEvent')
    EventVariant = apps.get_model('kingdom', 'EventVariant')
    EventRun = apps.get_model('kingdom', 'EventRun')
    for event in KingdomEvent.objects.filter(name_sk=NAME):
        variant, _ = EventVariant.objects.get_or_create(event=event, name_sk=LORD_OF_WAR['name_sk'], defaults=LORD_OF_WAR)
        if runs_on(event, RUN):
            EventRun.objects.get_or_create(event=event, start=RUN, defaults={'variant': variant})


class Migration(migrations.Migration):
    dependencies = [('kingdom', '0025_backfill_event_dates')]

    operations = [migrations.RunPython(lord_of_war, migrations.RunPython.noop)]

from datetime import UTC, datetime
from importlib import import_module

from django.db import migrations

# The fourth type of 20 GH: Game of Power, the run of Fri–Sat 27.–28. 11. 2026 (Gether's screenshot of the game's event
# list, 27. 11. 2026); the top reward takes 910 000 power (Gether, the same day). Only the event called "20 GH", the
# run tagged only when it really is one of its dates and has no type yet.
NAME = '20 GH'
RUN = datetime(2026, 11, 27, tzinfo=UTC)
GAME_OF_POWER = {
    'name_sk': 'Game of Power',
    'name_cs': '',
    'icon': 'game-of-power',
    'max_reward_sk': '910 000 power',
    'max_reward_cs': '910 000 power',
}
runs_on = import_module('kingdom.migrations.0019_training_day').runs_on


def game_of_power(apps, schema_editor):
    KingdomEvent = apps.get_model('kingdom', 'KingdomEvent')
    EventVariant = apps.get_model('kingdom', 'EventVariant')
    EventRun = apps.get_model('kingdom', 'EventRun')
    for event in KingdomEvent.objects.filter(name_sk=NAME):
        variant, _ = EventVariant.objects.get_or_create(
            event=event, name_sk=GAME_OF_POWER['name_sk'], defaults=GAME_OF_POWER
        )
        if runs_on(event, RUN):
            EventRun.objects.get_or_create(event=event, start=RUN, defaults={'variant': variant})


class Migration(migrations.Migration):
    dependencies = [('kingdom', '0027_event_message_one_line')]

    operations = [migrations.RunPython(game_of_power, migrations.RunPython.noop)]

from django.db import migrations

# Now Or Never's top reward for now: 48 000 minutes of speedups (Gether, 29. 10. 2026, "keď tak upravím potom").
# Only where the type has none yet, so a reward Gether already entered in the admin stays.
MAX_REWARD = {'max_reward_sk': '48 000 minút speedov', 'max_reward_cs': '48 000 minut speedů'}


def max_reward(apps, schema_editor):
    EventVariant = apps.get_model('kingdom', 'EventVariant')
    EventVariant.objects.filter(event__name_sk='20 GH', name_sk='Now Or Never', max_reward_sk='').update(**MAX_REWARD)


class Migration(migrations.Migration):
    dependencies = [('kingdom', '0020_now_or_never')]

    operations = [migrations.RunPython(max_reward, migrations.RunPython.noop)]

from django.db import migrations

# Karuak Ceremony and Karuak Boss get the masked Ceroli shaman of the in-game event instead of the Ceroli skull
# (Gether 11. 10. 2026). An icon changed by hand stays.


def set_icon(apps, schema_editor):
    KingdomEvent = apps.get_model('kingdom', 'KingdomEvent')
    KingdomEvent.objects.filter(name_sk__in=['Karuak Ceremony', 'Karuak Boss'], icon='ceroli').update(icon='karuak')


class Migration(migrations.Migration):
    dependencies = [('kingdom', '0015_officer_focus')]

    operations = [migrations.RunPython(set_icon, migrations.RunPython.noop)]

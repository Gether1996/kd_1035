"""A march counts its inscriptions clicked together (Gether 12. 10. 2026): the marches saved with clicked inscriptions
get their gold, blue and white counts from them; the others keep the counts typed in."""

from django.db import migrations

from guides import armory


def count(apps, schema_editor):
    March = apps.get_model('accounts', 'March')
    known = armory.inscriptions()
    for march in March.objects.exclude(inscriptions=[]):
        chosen = [i for i in march.inscriptions if i in known]
        if chosen:
            for colour, value in armory.counts(chosen).items():
                setattr(march, colour, value)
            march.save(update_fields=['gold', 'blue', 'white'])


class Migration(migrations.Migration):
    dependencies = [('accounts', '0019_march_without_screenshot')]

    operations = [migrations.RunPython(count, migrations.RunPython.noop)]

"""At most two formations a commander (v1.28.5): the admin allowed three from v1.28.0 – such a row would make every
save of the formations from the page fail, and the page shows two. The first two stay."""

from django.db import migrations


def trim(apps, schema_editor):
    CommanderFormation = apps.get_model('guides', 'CommanderFormation')
    for row in CommanderFormation.objects.all():
        if len(row.formations) > 2:
            row.formations = row.formations[:2]
            row.save(update_fields=['formations'])


class Migration(migrations.Migration):
    dependencies = [('guides', '0014_commander_formations')]

    operations = [migrations.RunPython(trim, migrations.RunPython.noop)]

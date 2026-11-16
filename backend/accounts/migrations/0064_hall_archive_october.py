# Gether 16. 11. 2026: the archive "Pevnosti" with one name was saved with the fort week 2. 11. – 8. 11. 2026 – it is
# the champion of the previous month: October. Only that one archive changes; on a database without it nothing does.
from datetime import date

from django.db import migrations

WEEK = (date(2026, 11, 2), date(2026, 11, 8))
OCTOBER = (date(2026, 10, 1), date(2026, 10, 31))


def to_october(apps, schema_editor):
    HallArchive = apps.get_model('accounts', 'HallArchive')
    for archive in HallArchive.objects.filter(label='Pevnosti', week_from=WEEK[0], week_to=WEEK[1]):
        if archive.entries.count() == 1:
            archive.week_from, archive.week_to = OCTOBER
            archive.save(update_fields=['week_from', 'week_to'])


def back(apps, schema_editor):
    HallArchive = apps.get_model('accounts', 'HallArchive')
    HallArchive.objects.filter(label='Pevnosti', week_from=OCTOBER[0], week_to=OCTOBER[1]).update(
        week_from=WEEK[0], week_to=WEEK[1]
    )


class Migration(migrations.Migration):
    dependencies = [('accounts', '0063_forum_signed_post')]

    operations = [migrations.RunPython(to_october, back)]

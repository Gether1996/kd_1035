# Gether 16. 11. 2026: the archive "Pevnosti" with one name is the fort week before 2. 11. – 26. 10. – 1. 11. 2026,
# not October (0064 misread "predošlý"). Only that archive changes; from now on the days are editable on /sien-slavy.
from datetime import date

from django.db import migrations

OCTOBER = (date(2026, 10, 1), date(2026, 10, 31))
WEEK_BEFORE = (date(2026, 10, 26), date(2026, 11, 1))


def to_week_before(apps, schema_editor):
    HallArchive = apps.get_model('accounts', 'HallArchive')
    for archive in HallArchive.objects.filter(label='Pevnosti', week_from=OCTOBER[0], week_to=OCTOBER[1]):
        if archive.entries.count() == 1:
            archive.week_from, archive.week_to = WEEK_BEFORE
            archive.save(update_fields=['week_from', 'week_to'])


def back(apps, schema_editor):
    HallArchive = apps.get_model('accounts', 'HallArchive')
    HallArchive.objects.filter(label='Pevnosti', week_from=WEEK_BEFORE[0], week_to=WEEK_BEFORE[1]).update(
        week_from=OCTOBER[0], week_to=OCTOBER[1]
    )


class Migration(migrations.Migration):
    dependencies = [('accounts', '0064_hall_archive_october')]

    operations = [migrations.RunPython(to_week_before, back)]

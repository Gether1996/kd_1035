"""The count of a Hall of Fame place becomes free text (Gether 28. 10. 2026: "nech tam môžem napísať napr. 1.37B"): a
number already entered is kept as its digits, none as ''."""

from django.db import migrations, models


def to_text(apps, schema_editor):
    HallEntry = apps.get_model('accounts', 'HallEntry')
    HallEntry.objects.filter(count_text__isnull=True).update(count_text='')


class Migration(migrations.Migration):
    dependencies = [('accounts', '0048_hall_count')]

    operations = [
        migrations.AddField('hallentry', 'count_text', models.CharField('počet', max_length=24, null=True, blank=True)),
        migrations.RunSQL(
            'UPDATE accounts_hallentry SET count_text = CAST(count AS TEXT) WHERE count IS NOT NULL',
            migrations.RunSQL.noop,
        ),
        migrations.RunPython(to_text, migrations.RunPython.noop),
        migrations.RemoveField('hallentry', 'count'),
        migrations.RenameField('hallentry', 'count_text', 'count'),
        migrations.AlterField(
            'hallentry', 'count', models.CharField('počet', max_length=24, blank=True, default='')
        ),
    ]

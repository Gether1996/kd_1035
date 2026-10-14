import django.core.validators
from django.db import migrations, models


def one_switch(apps, schema_editor):
    """Gether 14. 10. 2026: the estimate and the variables are one switch – whoever had the table keeps it."""
    Player = apps.get_model('accounts', 'Player')
    Player.objects.filter(evaluator=True).update(evaluation_settings=True)


class Migration(migrations.Migration):
    dependencies = [('accounts', '0030_march_notice')]

    operations = [
        migrations.AlterField(
            model_name='player',
            name='evaluator',
            field=models.BooleanField(
                default=False,
                help_text='Nepoužíva sa od 14. 10. 2026 – tabuľku aj premenné povoľuje „nastavenia vyhodnocovania“.',
                verbose_name='tabuľka vyhodnocovania (nepoužíva sa)',
            ),
        ),
        migrations.AlterField(
            model_name='player',
            name='evaluation_settings',
            field=models.BooleanField(
                default=False,
                help_text='Hráč vidí na /vyhodnocovanie odhad acclaimu schválených hráčov, zapisuje im power a T4, '
                'mení premenné výpočtu, páry a formácie commanderov (platí pre všetkých) a zverejňuje požadovaný '
                'acclaim. Nastavuje superadmin.',
                verbose_name='nastavenia vyhodnocovania',
            ),
        ),
        migrations.AddField(
            model_name='player',
            name='evaluation_overview',
            field=models.BooleanField(
                default=False,
                help_text='Hráč vidí na /vyhodnocovanie zverejnený požadovaný acclaim schválených hráčov (iba '
                'čítanie). Nastavuje superadmin.',
                verbose_name='požadovaný acclaim',
            ),
        ),
        migrations.AddField(
            model_name='evaluationsettings',
            name='overview',
            field=models.JSONField(blank=True, default=list, verbose_name='zverejnený požadovaný acclaim'),
        ),
        migrations.AddField(
            model_name='evaluationsettings',
            name='overview_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='zverejnené'),
        ),
        migrations.AlterField(
            model_name='playerevaluation',
            name='acclaim',
            field=models.PositiveBigIntegerField(
                blank=True,
                null=True,
                validators=[django.core.validators.MaxValueValidator(10**12)],
                verbose_name='aktuálny acclaim (nepoužíva sa)',
            ),
        ),
        migrations.RunPython(one_switch, migrations.RunPython.noop),
    ]

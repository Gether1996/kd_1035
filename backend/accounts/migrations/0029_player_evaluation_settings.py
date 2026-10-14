from django.db import migrations, models


def keep_access(apps, schema_editor):
    """Whoever had /vyhodnocovanie could change everything there – they keep the variables too."""
    Player = apps.get_model('accounts', 'Player')
    Player.objects.filter(evaluator=True).update(evaluation_settings=True)


class Migration(migrations.Migration):
    dependencies = [('accounts', '0028_player_evaluator')]

    operations = [
        migrations.AlterField(
            model_name='player',
            name='evaluator',
            field=models.BooleanField(
                default=False,
                help_text='Hráč vidí na /vyhodnocovanie odhad acclaimu schválených hráčov a zapisuje im power, '
                'acclaim a T4. Nastavuje superadmin.',
                verbose_name='tabuľka vyhodnocovania',
            ),
        ),
        migrations.AddField(
            model_name='player',
            name='evaluation_settings',
            field=models.BooleanField(
                default=False,
                help_text='Hráč mení na /vyhodnocovanie premenné výpočtu a tabuľku párov commanderov (platí pre '
                'všetkých). Nastavuje superadmin.',
                verbose_name='nastavenia vyhodnocovania',
            ),
        ),
        migrations.RunPython(keep_access, migrations.RunPython.noop),
    ]

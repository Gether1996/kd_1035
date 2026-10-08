from django.db import migrations, models


def remove_r4_group(apps, schema_editor):
    # the group existed only to approve Governor registrations, which Gether dropped in favour of the in-game name
    apps.get_model('auth', 'Group').objects.filter(name='R4').delete()


class Migration(migrations.Migration):
    dependencies = [('accounts', '0003_r4_group')]

    operations = [
        migrations.RunPython(remove_r4_group, migrations.RunPython.noop),
        migrations.DeleteModel(name='Governor'),
        migrations.AddField(
            model_name='player',
            name='ingame_name',
            field=models.CharField(
                blank=True,
                help_text='Vyplní si ho hráč sám na webe (Môj účet).',
                max_length=32,
                verbose_name='meno v hre',
            ),
        ),
    ]

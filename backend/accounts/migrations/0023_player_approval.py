"""Approval of new players (Gether 12. 10. 2026): every player already signed in may add marches and KvK sign-ups,
a new one waits until the superadmin approves them; the superadmin gets a Discord DM about each new player (only the
ones signing in from now on – the existing ones count as announced)."""

from django.db import migrations, models


def approve_existing(apps, schema_editor):
    apps.get_model('accounts', 'Player').objects.update(approved=True, announced=True)


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0022_kvk_signup_like_a_march'),
    ]

    operations = [
        migrations.AddField(
            model_name='player',
            name='announced',
            field=models.BooleanField(default=False, help_text='Worker poslal superadminovi na Discord, že sa prihlásil nový hráč.', verbose_name='superadmin upozornený'),
        ),
        migrations.AddField(
            model_name='player',
            name='approved',
            field=models.BooleanField(default=False, help_text='Môže pridávať marche a prihlášky na KvK a vidí marche ostatných hráčov. Nového hráča schvaľuje superadmin (hráči z čias pred schvaľovaním sú schválení).', verbose_name='schválený'),
        ),
        migrations.AlterField(
            model_name='player',
            name='kvk_reviewer',
            field=models.BooleanField(default=False, help_text='Hráč (napr. R4) vidí všetky prihlášky na KvK a marche všetkých hráčov. Nastavuje superadmin.', verbose_name='vidí KvK prihlášky'),
        ),
        migrations.AlterField(
            model_name='player',
            name='marches_public',
            field=models.BooleanField(default=False, help_text='Hráč povolil, aby jeho marche videli všetci schválení hráči prihlásení na webe (inak len R4).', verbose_name='marche vidia všetci'),
        ),
        migrations.RunPython(approve_existing, migrations.RunPython.noop),
    ]

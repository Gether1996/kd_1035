"""Strikes instead of yellow cards (Gether 18. 11. 2026: "1, 2 a tretí strike … prvý priestupok 1 týždeň kick z Ali, druhý
kumulatívny 2 týždne, tretí zero, ale po skončení priestupku sa to resetuje za X času"): the escalation window counts
from the end of the penalty (reset_days) instead of from the violation (window_days), a description for every player.
Rules still at the first defaults (0066) get the strikes; rules leadership already changed stay as they were."""

import django.core.validators
from django.db import migrations, models

import accounts.models

OLD_LEVELS = [
    {'name': 'Žltá karta', 'penalty': 'Varovanie', 'days': 0},
    {'name': '2. žltá karta', 'penalty': 'Vylúčenie z eventov (MGE, Ark)', 'days': 14},
    {'name': 'Červená karta', 'penalty': 'Vylúčenie z eventov (MGE, Ark)', 'days': 30},
]


def strikes(apps, schema_editor):
    ViolationSettings = apps.get_model('accounts', 'ViolationSettings')
    for rules in ViolationSettings.objects.all():
        if rules.levels == OLD_LEVELS:
            rules.levels = accounts.models.default_violation_levels()
            rules.save(update_fields=['levels'])


class Migration(migrations.Migration):
    dependencies = [('accounts', '0067_power_locked')]

    operations = [
        migrations.RemoveField(model_name='violationsettings', name='window_days'),
        migrations.AddField(
            model_name='violationsettings',
            name='reset_days',
            field=models.PositiveSmallIntegerField(
                default=30,
                help_text='Keď trest skončí a do tohto počtu dní nepríde ďalší priestupok, hráč je znova na nule.',
                validators=[
                    django.core.validators.MinValueValidator(0),
                    django.core.validators.MaxValueValidator(3650),
                ],
                verbose_name='reset po treste (dni)',
            ),
        ),
        migrations.AddField(
            model_name='violationsettings',
            name='description',
            field=models.TextField(
                blank=True, default=accounts.models.DEFAULT_VIOLATION_DESCRIPTION, max_length=2000, verbose_name='popis'
            ),
        ),
        migrations.AlterField(
            model_name='violationsettings',
            name='levels',
            field=models.JSONField(default=accounts.models.default_violation_levels, verbose_name='striky'),
        ),
        migrations.RunPython(strikes, migrations.RunPython.noop),
    ]

from django.db import migrations, models

ARMY = ['primary', 'secondary', 'attack', 'defense', 'health', 'damage', 'white', 'blue', 'gold', 'note']


def split_roles(apps, schema_editor):
    # a sign-up for both became the rally one plus a garrison copy without screenshots (Gether 11. 10. 2026: a player
    # signs up for rally and garrison separately, each with its own army); nothing was deployed yet
    KvkSignup = apps.get_model('accounts', 'KvkSignup')
    for signup in KvkSignup.objects.all():
        if signup.garrison and not signup.rally:
            signup.role = 'garrison'
            signup.save(update_fields=['role'])
        elif signup.garrison:
            KvkSignup.objects.create(
                round_id=signup.round_id,
                player_id=signup.player_id,
                role='garrison',
                **{field: getattr(signup, field) for field in ARMY},
            )


class Migration(migrations.Migration):
    dependencies = [
        ('accounts', '0014_march_without_armaments_screenshot'),
    ]

    operations = [
        migrations.RemoveConstraint(model_name='kvksignup', name='one_kvk_signup_per_player'),
        migrations.AddField(
            model_name='kvksignup',
            name='role',
            field=models.CharField(
                choices=[('rally', 'rally'), ('garrison', 'garrison')], default='rally', max_length=8, verbose_name='rola'
            ),
            preserve_default=False,
        ),
        migrations.RunPython(split_roles, migrations.RunPython.noop),
        migrations.RemoveField(model_name='kvksignup', name='rally'),
        migrations.RemoveField(model_name='kvksignup', name='garrison'),
        migrations.AddConstraint(
            model_name='kvksignup',
            constraint=models.UniqueConstraint(
                fields=('round', 'player', 'role'), name='one_kvk_signup_per_player_and_role'
            ),
        ),
    ]

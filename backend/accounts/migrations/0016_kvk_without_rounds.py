from django.db import migrations, models


def keep_newest(apps, schema_editor):
    """The title of the open (or newest) round becomes the heading; of a player's sign-ups for one role only the newest
    stays (Gether 11. 10. 2026: no rounds, a sign-up stays until withdrawn). Nothing was deployed yet; the files of the
    deleted screenshots go with the daily sweep_files."""
    KvkRound = apps.get_model('accounts', 'KvkRound')
    KvkSettings = apps.get_model('accounts', 'KvkSettings')
    KvkSignup = apps.get_model('accounts', 'KvkSignup')
    latest = KvkRound.objects.order_by('-is_open', '-created_at').first()
    KvkSettings.objects.create(pk=1, title_sk=latest.title_sk if latest else '', title_cs=latest.title_cs if latest else '')
    seen = set()
    for signup in KvkSignup.objects.order_by('-updated_at'):
        key = (signup.player_id, signup.role)
        if key in seen:
            signup.delete()
        seen.add(key)


class Migration(migrations.Migration):
    dependencies = [
        ('accounts', '0015_kvk_signup_role'),
    ]

    operations = [
        migrations.CreateModel(
            name='KvkSettings',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title_sk', models.CharField(blank=True, max_length=80, verbose_name='názov (SK)')),
                (
                    'title_cs',
                    models.CharField(
                        blank=True, help_text='Prázdne = slovenský názov.', max_length=80, verbose_name='názov (CZ)'
                    ),
                ),
            ],
            options={'verbose_name': 'KvK prihlasovanie', 'verbose_name_plural': 'KvK prihlasovanie'},
        ),
        migrations.RunPython(keep_newest, migrations.RunPython.noop),
        migrations.RemoveConstraint(model_name='kvksignup', name='one_kvk_signup_per_player_and_role'),
        migrations.RemoveField(model_name='kvksignup', name='round'),
        migrations.AddConstraint(
            model_name='kvksignup',
            constraint=models.UniqueConstraint(fields=('player', 'role'), name='one_kvk_signup_per_role'),
        ),
        migrations.DeleteModel(name='KvkRound'),
    ]

from django.db import migrations


def share(apps, schema_editor):
    """One survey for both sign-ups of a player (Gether 20. 10. 2026): a sign-up without it gets the answers of the
    player's other sign-up."""
    KvkSignup = apps.get_model('accounts', 'KvkSignup')
    for filled in KvkSignup.objects.exclude(budget='').exclude(online=[]):
        KvkSignup.objects.filter(player_id=filled.player_id).exclude(pk=filled.pk).filter(budget='').update(
            budget=filled.budget, online=filled.online
        )
        KvkSignup.objects.filter(player_id=filled.player_id).exclude(pk=filled.pk).filter(online=[]).update(
            budget=filled.budget, online=filled.online
        )


class Migration(migrations.Migration):
    dependencies = [
        ('accounts', '0036_kvk_signup_survey'),
    ]

    operations = [
        migrations.RunPython(share, migrations.RunPython.noop),
    ]

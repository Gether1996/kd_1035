from django.db import migrations


def seed(apps, schema_editor):
    Alliance = apps.get_model('kingdom', 'Alliance')
    Officer = apps.get_model('kingdom', 'Officer')
    SocialLink = apps.get_model('kingdom', 'SocialLink')

    alliance, created = Alliance.objects.get_or_create(tag='CS35', defaults={'name': 'CZ/SK Legends'})
    if created:
        Officer.objects.create(alliance=alliance, order=0, name='Methiu von CzF', title_sk='Vodca', title_cs='Vůdce')
        Officer.objects.create(
            alliance=alliance, order=1, name='Gether', title_sk='R4', title_cs='R4',
            discord_id='245662824171438090', discord_username='gether_',
        )
        Officer.objects.create(
            alliance=alliance, order=2, name='Hefarion', title_sk='R4', title_cs='R4', discord_id='787663147811995680'
        )
    SocialLink.objects.get_or_create(
        platform='facebook', defaults={'url': 'https://www.facebook.com/groups/550189483954751'}
    )
    # permanent invite (never expires, unlimited uses)
    SocialLink.objects.get_or_create(platform='discord', defaults={'url': 'https://discord.gg/NhwP6y9ssM'})


class Migration(migrations.Migration):
    dependencies = [('kingdom', '0001_initial')]

    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]

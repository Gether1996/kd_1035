from django.db import migrations


def guess_icons(apps, schema_editor):
    """Alliance Mobilization, Shadow Legion and Silk Road got icons (cut out of Gether's screenshots)."""
    from kingdom.event_icons import guess

    KingdomEvent = apps.get_model('kingdom', 'KingdomEvent')
    for event in KingdomEvent.objects.filter(icon=''):
        icon = guess(event.name_sk)
        if icon:
            KingdomEvent.objects.filter(pk=event.pk).update(icon=icon)


class Migration(migrations.Migration):
    dependencies = [
        ('kingdom', '0006_kingdomevent_icon'),
    ]

    operations = [
        migrations.RunPython(guess_icons, migrations.RunPython.noop),
    ]

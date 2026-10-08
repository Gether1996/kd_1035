from django.db import migrations, models


def guess_icons(apps, schema_editor):
    """Existing events get the icon their name suggests (new ones get it in KingdomEvent.save())."""
    from kingdom.event_icons import guess

    KingdomEvent = apps.get_model('kingdom', 'KingdomEvent')
    for event in KingdomEvent.objects.filter(icon=''):
        icon = guess(event.name_sk)
        if icon:
            KingdomEvent.objects.filter(pk=event.pk).update(icon=icon)


class Migration(migrations.Migration):
    dependencies = [
        ('kingdom', '0005_kingdomevent_irregular'),
    ]

    operations = [
        migrations.AddField(
            model_name='kingdomevent',
            name='icon',
            field=models.CharField(
                blank=True,
                help_text='Ikona v kalendári a v pripomienkach. Nový event ju dostane podľa názvu; bez ikony web '
                'ukáže monogram (prvé písmená názvu).',
                max_length=32,
                verbose_name='ikona',
            ),
        ),
        migrations.RunPython(guess_icons, migrations.RunPython.noop),
    ]

from django.db import migrations

# 0008 split Hunt for History into a hammer and an egg event, but the egg one is a different event of the game:
# Holy Knight's Treasure (codexhelper.com calendar: holy_knights_treasure = egg.webp, hunt_for_history = hammer.webp)
RENAMES = [
    # old SK name, new name, the icon it gets when it still has the old egg (or none)
    ('Hunt for History (kladivo)', 'Hunt for History', 'hammer'),
    ('Hunt for History (vajce)', "Holy Knight's Treasure", 'egg'),
]


def rename(apps, schema_editor):
    KingdomEvent = apps.get_model('kingdom', 'KingdomEvent')
    EventNotification = apps.get_model('kingdom', 'EventNotification')
    for old, new, icon in RENAMES:
        for event in KingdomEvent.objects.filter(name_sk=old):
            event.name_sk = new
            event.name_cs = ''
            if event.icon in ('', 'egg'):
                event.icon = icon
            event.save()
            # planned reminders carry the old name in their title; the worker plans them again
            EventNotification.objects.filter(event=event, status='pending').delete()


class Migration(migrations.Migration):
    dependencies = [
        ('kingdom', '0008_hunt_for_history_hammer_and_egg'),
    ]

    operations = [
        migrations.RunPython(rename, migrations.RunPython.noop),
    ]

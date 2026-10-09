"""Web push is dropped (9. 10. 2026): personal reminders go only as a Discord DM from the bot.

Removes the players' browser subscriptions, the send log of the push channel and the admin history about the
subscriptions (it names the player).
"""

from django.db import migrations, models


def forget_push(apps, schema_editor):
    db = schema_editor.connection.alias
    apps.get_model('accounts', 'SentReminder').objects.using(db).filter(channel='push').delete()
    ContentType = apps.get_model('contenttypes', 'ContentType')
    LogEntry = apps.get_model('admin', 'LogEntry')
    for content_type in ContentType.objects.using(db).filter(app_label='accounts', model='pushsubscription'):
        LogEntry.objects.using(db).filter(content_type=content_type).delete()
        # its permissions go with it
        content_type.delete()


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0005_event_reminders'),
        ('admin', '0003_logentry_add_action_flag_choices'),
        ('contenttypes', '0002_remove_content_type_name'),
    ]

    operations = [
        migrations.RunPython(forget_push, migrations.RunPython.noop),
        migrations.DeleteModel(name='PushSubscription'),
        migrations.AlterField(
            model_name='sentreminder',
            name='channel',
            field=models.CharField(choices=[('discord', 'Discord')], max_length=8, verbose_name='kanál'),
        ),
    ]

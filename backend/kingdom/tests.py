import gzip
import sqlite3
import tempfile
from datetime import timedelta
from pathlib import Path
from unittest import mock

from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone

from . import backups, discord
from .models import Alliance, EventNotification, SocialLink


class ApiTests(TestCase):
    def test_health(self):
        self.assertEqual(self.client.get('/api/health/').json(), {'status': 'ok'})

    def test_alliances_hide_inactive(self):
        Alliance.objects.create(tag='OFF', name='Hidden', is_active=False)
        data = self.client.get('/api/alliances/').json()
        self.assertEqual([a['tag'] for a in data], ['CS35'])  # seeded by migration
        self.assertEqual(set(data[0]), {'id', 'tag', 'name', 'officers'})
        self.assertEqual([o['name'] for o in data[0]['officers']], ['Methiu von CzF', 'Gether'])

    def test_links_hide_inactive(self):
        SocialLink.objects.create(platform='discord', url='https://discord.gg/x')
        SocialLink.objects.filter(platform='facebook').update(is_active=False)
        self.assertEqual(self.client.get('/api/links/').json(), [{'platform': 'discord', 'url': 'https://discord.gg/x'}])


@override_settings(DISCORD_WEBHOOK_URL='https://discord.test/hook', DISCORD_EVENT_ROLE_ID='42')
class DiscordTests(TestCase):
    def make(self, minutes_ago=1, **kwargs):
        return EventNotification.objects.create(
            title='MGE', send_at=timezone.now() - timedelta(minutes=minutes_ago), **kwargs
        )

    def test_sends_only_due_notifications(self):
        due = self.make()
        later = self.make(minutes_ago=-60)
        with mock.patch.object(discord, 'post') as post:
            self.assertEqual(discord.send_due(), 1)
        post.assert_called_once_with(due)
        due.refresh_from_db()
        later.refresh_from_db()
        self.assertEqual(due.status, EventNotification.Status.SENT)
        self.assertIsNotNone(due.sent_at)
        self.assertEqual(later.status, EventNotification.Status.PENDING)

    def test_failure_is_stored(self):
        n = self.make()
        with mock.patch.object(discord, 'post', side_effect=discord.DiscordError('boom')):
            discord.send_due()
        n.refresh_from_db()
        self.assertEqual((n.status, n.error), (EventNotification.Status.FAILED, 'boom'))

    def test_long_missed_notification_is_not_sent(self):
        n = self.make(minutes_ago=60 * 24)
        with mock.patch.object(discord, 'post') as post:
            discord.send_due()
        post.assert_not_called()
        n.refresh_from_db()
        self.assertEqual(n.status, EventNotification.Status.FAILED)

    def test_payload_pings_role(self):
        n = self.make()
        with mock.patch('urllib.request.urlopen') as urlopen:
            discord.post(n)
        request = urlopen.call_args.args[0]
        self.assertIn(b'"content": "<@&42>"', request.data)
        self.assertIn(b'"roles": ["42"]', request.data)

    @override_settings(DISCORD_WEBHOOK_URL='')
    def test_missing_webhook_is_an_error(self):
        with self.assertRaises(discord.DiscordError):
            discord.post(self.make())


class BackupTests(TransactionTestCase):
    def test_backup_prune_and_restore(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            with override_settings(MEDIA_ROOT=folder / 'media'):
                first = backups.create_backup(folder, keep=2)
                self.assertTrue(first.name.endswith('.sqlite3.gz'))
                with gzip.open(first) as f, open(folder / 'check.sqlite3', 'wb') as out:
                    out.write(f.read())
                tables = sqlite3.connect(folder / 'check.sqlite3').execute(
                    "SELECT name FROM sqlite_master WHERE name='kingdom_alliance'"
                ).fetchall()
                self.assertEqual(len(tables), 1)

                self.assertFalse(backups.backup_due(folder, interval_days=7))
                for i in range(3):
                    (folder / f'kd1035_2000-01-0{i + 1}_000000.sqlite3.gz').write_bytes(b'')
                backups.prune(folder, keep=2)
                self.assertEqual(len(list(folder.glob('kd1035_*.sqlite3.gz'))), 2)

                Alliance.objects.all().delete()
                backups.restore_backup(first)
                self.assertTrue(Alliance.objects.filter(tag='CS35').exists())

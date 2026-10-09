import json
import os
import tempfile
from contextlib import ExitStack
from datetime import timedelta
from pathlib import Path
from unittest import mock

from django.contrib.auth.models import AnonymousUser, User
from django.core.management import call_command
from django.template import Context, Template
from django.test import RequestFactory, SimpleTestCase, TestCase, TransactionTestCase, override_settings
from django.utils import timezone

from accounts.models import Player, SentReminder

from . import overview
from .models import EventNotification, KingdomEvent

Status = EventNotification.Status
WORKER = 'kingdom.management.commands.run_worker'


class Stop(Exception):
    pass


class TempStatusMixin:
    """Every test gets its own WORKER_STATUS_PATH and BACKUP_DIR – never the real /app/data."""

    def setUp(self):
        super().setUp()
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.folder = Path(tmp.name)
        self.path = self.folder / 'worker_status.json'
        settings = override_settings(WORKER_STATUS_PATH=self.path, BACKUP_DIR=self.folder / 'backups')
        settings.enable()
        self.addCleanup(settings.disable)

    def write(self, **data):
        self.path.write_text(json.dumps(data))


class StateTests(TempStatusMixin, SimpleTestCase):
    def test_missing_file(self):
        now = timezone.now()
        self.assertIsNone(overview.read_status())
        self.assertEqual(overview.worker_state(None, now)['state'], 'missing')
        self.assertEqual(overview.backup_state(None, now)['state'], 'missing')
        self.path.write_text('not json')
        self.assertIsNone(overview.read_status())

    def test_worker_stale_after_threshold(self):
        now = timezone.now()
        self.write(last_tick=(now - overview.WORKER_STALE + timedelta(seconds=5)).isoformat())
        self.assertEqual(overview.worker_state(overview.read_status(), now)['state'], 'ok')
        self.write(last_tick=(now - overview.WORKER_STALE - timedelta(seconds=5)).isoformat())
        state = overview.worker_state(overview.read_status(), now)
        self.assertEqual(state['state'], 'stale')
        self.assertEqual(state['age'], '2 min')

    @override_settings(BACKUP_INTERVAL_DAYS=7)
    def test_backup_old_after_interval_and_grace(self):
        now = timezone.now()
        limit = timedelta(days=7) + overview.BACKUP_GRACE
        self.assertEqual(overview.BACKUP_GRACE, timedelta(days=1))
        recent = {'last_backup_at': (now - limit + timedelta(minutes=1)).isoformat(), 'last_backup_file': 'a.gz'}
        self.assertEqual(overview.backup_state(recent, now)['state'], 'ok')
        old = {'last_backup_at': (now - limit - timedelta(minutes=1)).isoformat()}
        self.assertEqual(overview.backup_state(old, now)['state'], 'old')
        self.assertEqual(overview.backup_state(old, now)['age'], '8 d')

    def test_age(self):
        self.assertEqual(overview.age(timedelta(seconds=-5)), '0 min')
        self.assertEqual(overview.age(timedelta(minutes=59)), '59 min')
        self.assertEqual(overview.age(timedelta(hours=47, minutes=59)), '47 h')
        self.assertEqual(overview.age(timedelta(days=9, hours=3)), '9 d 3 h')


class HeartbeatTests(TempStatusMixin, SimpleTestCase):
    def test_tick_writes_atomically_as_the_worker_user(self):
        heartbeat = overview.Heartbeat()
        self.assertTrue(heartbeat.tick())
        status = overview.read_status()
        self.assertEqual(overview.worker_state(status, timezone.now())['state'], 'ok')
        self.assertIsNone(status['last_backup_at'])
        self.assertEqual([p.name for p in self.folder.iterdir()], ['worker_status.json'])  # no temp file left
        info = self.path.stat()
        self.assertEqual(info.st_mode & 0o777, 0o644)  # the backend (gunicorn) must read it
        if hasattr(os, 'geteuid'):
            # written by the worker process itself – on the server that is `app`, see the next test
            self.assertEqual(info.st_uid, os.geteuid())

    def test_worker_drops_root_before_writing(self):
        # the production worker container starts as root; the heartbeat must not be root-owned
        script = (Path(__file__).resolve().parent.parent / 'worker.sh').read_text()
        command = [line for line in script.splitlines() if 'run_worker' in line]
        self.assertEqual(len(command), 1)
        self.assertIn('setpriv --reuid=app --regid=app', command[0])

    def test_write_error_is_logged_once_and_swallowed(self):
        heartbeat = overview.Heartbeat()
        with (
            mock.patch('kingdom.overview.os.replace', side_effect=PermissionError('read-only')),
            self.assertLogs('kingdom.overview', 'WARNING') as logs,
        ):
            self.assertFalse(heartbeat.tick())
            self.assertFalse(heartbeat.tick())
        self.assertEqual(len(logs.records), 1)
        self.assertEqual(list(self.folder.iterdir()), [])  # the temp file is removed
        with mock.patch('kingdom.overview.tempfile.mkstemp', side_effect=PermissionError('no dir')):
            self.assertFalse(heartbeat.tick())
        self.assertTrue(heartbeat.tick())

    def test_last_backup_survives_a_restart(self):
        first = overview.Heartbeat()
        first.backup_written(Path('/backups/kd1035_2026-10-01_120000.sqlite3.gz'))
        saved = overview.read_status()

        second = overview.Heartbeat()  # worker restarted
        second.tick()
        status = overview.read_status()
        self.assertEqual(status['last_backup_file'], 'kd1035_2026-10-01_120000.sqlite3.gz')
        self.assertEqual(status['last_backup_at'], saved['last_backup_at'])

    def test_newer_backup_in_the_folder_wins(self):
        # e.g. made by hand with backup_db, or before the heartbeat existed
        backups = self.folder / 'backups'
        backups.mkdir()
        (backups / 'kd1035_2026-10-08_181532.sqlite3.gz').write_bytes(b'')
        self.write(last_backup_at=(timezone.now() - timedelta(days=30)).isoformat(), last_backup_file='old.gz')
        heartbeat = overview.Heartbeat(backups)
        heartbeat.tick()
        self.assertEqual(overview.read_status()['last_backup_file'], 'kd1035_2026-10-08_181532.sqlite3.gz')

    def test_worker_records_the_backup_only_after_it_was_written(self):
        archive = self.folder / 'kd1035_2026-10-09_120000.sqlite3.gz'

        def one_round(create_backup):
            with ExitStack() as stack:
                for name in ('close_old_connections', 'send_due', 'send_personal_reminders', 'prune_sent'):
                    stack.enter_context(mock.patch(f'{WORKER}.{name}'))
                stack.enter_context(mock.patch(f'{WORKER}.call_command'))
                stack.enter_context(mock.patch(f'{WORKER}.plan_reminders', return_value=0))
                stack.enter_context(mock.patch(f'{WORKER}.backup_due', return_value=True))
                stack.enter_context(mock.patch(f'{WORKER}.create_backup', **create_backup))
                stack.enter_context(mock.patch('time.sleep', side_effect=Stop))
                stack.enter_context(self.assertRaises(Stop))
                call_command('run_worker')

        with self.assertLogs(WORKER, 'ERROR'):
            one_round({'side_effect': OSError('disk full')})
        status = overview.read_status()
        self.assertIsNotNone(status['last_tick'])
        self.assertIsNone(status['last_backup_at'])

        one_round({'return_value': archive})
        self.assertEqual(overview.read_status()['last_backup_file'], archive.name)


@override_settings(
    DISCORD_WEBHOOK_URL='https://discord.test/api/webhooks/1/hook-secret-value',
    DISCORD_EVENT_ROLE_ID='',
    DISCORD_BOT_TOKEN='bot-token-secret-value',
)
class AdminPanelTests(TempStatusMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.admin = User.objects.create_superuser('boss', password='x')

    def test_superuser_sees_the_panel(self):
        now = timezone.now()
        self.write(last_tick=now.isoformat(), last_backup_at=(now - timedelta(days=2)).isoformat())
        for minutes in range(1, 8):
            EventNotification.objects.create(title=f'Pripomienka {minutes}', send_at=now + timedelta(minutes=minutes))
        EventNotification.objects.create(title='Odoslaná', send_at=now + timedelta(minutes=1), status=Status.SENT)
        EventNotification.objects.create(title='Chyba', send_at=now - timedelta(days=1), status=Status.FAILED)
        EventNotification.objects.create(title='Stará', send_at=now - timedelta(days=8), status=Status.FAILED)

        self.client.force_login(self.admin)
        response = self.client.get('/admin/')
        self.assertContains(response, 'id="kd-overview"')
        self.assertContains(response, 'Beží')
        self.assertContains(response, 'pred 2 d')
        html = response.content.decode()
        # the next five pending ones, in order, each linking to its change page
        first = EventNotification.objects.get(title='Pripomienka 1')
        self.assertIn(f'/admin/kingdom/eventnotification/{first.pk}/change/', html)
        self.assertIn('Pripomienka 5', html)
        self.assertNotIn('Pripomienka 6', html)
        self.assertNotIn('Odoslaná', html)
        self.assertIn('/admin/kingdom/eventnotification/?status__exact=failed', html)
        self.assertEqual(overview.overview()['failed'], 1)
        self.assertIn('/admin/accounts/sentreminder/?ok__exact=0', html)
        # the normal app list is still there
        self.assertContains(response, 'Eventy kráľovstva')

    def test_no_secret_in_the_html(self):
        self.client.force_login(self.admin)
        html = self.client.get('/admin/').content.decode()
        self.assertNotIn('hook-secret-value', html)
        self.assertNotIn('discord.test', html)
        self.assertNotIn('bot-token-secret-value', html)
        self.assertIn('<code>DISCORD_WEBHOOK_URL</code> nastavené', html)
        self.assertIn('<code>DISCORD_EVENT_ROLE_ID</code> <strong>chýba</strong>', html)
        self.assertIn('<code>DISCORD_BOT_TOKEN</code> nastavené', html)

    def test_worker_states_in_the_panel(self):
        self.client.force_login(self.admin)
        self.assertContains(self.client.get('/admin/'), 'Worker ešte nezapísal stav')
        self.write(last_tick=(timezone.now() - timedelta(minutes=10)).isoformat())
        response = self.client.get('/admin/')
        self.assertContains(response, 'Worker nebeží')
        self.assertContains(response, 'Žiadna záloha')

    def test_staff_without_superuser_sees_the_normal_index(self):
        staff = User.objects.create_user('r4', password='x', is_staff=True)
        self.client.force_login(staff)
        response = self.client.get('/admin/')
        self.assertEqual(response.status_code, 200)
        self.assertNotContains(response, 'kd-overview')
        self.assertNotContains(response, 'Prehľad')

    def test_tag_queries_nothing_for_others(self):
        staff = User.objects.create_user('r4', password='x', is_staff=True)
        template = Template('{% load kd_admin %}{% kd_overview as o %}{{ o|default:"none" }}')
        for user in (staff, AnonymousUser()):
            request = RequestFactory().get('/admin/')
            request.user = user
            with self.assertNumQueries(0):
                self.assertEqual(template.render(Context({'request': request})), 'none')

    def test_failed_personal_reminders_are_counted_without_names(self):
        now = timezone.now()
        user = User.objects.create_user('discord_80351110224678912')
        player = Player.objects.create(user=user, discord_id='80351110224678912', username='nelly', global_name='Nelly')
        event = KingdomEvent.objects.create(name_sk='Ruiny', starts_at=now + timedelta(days=1))
        common = {'player': player, 'event': event, 'channel': SentReminder.Channel.DISCORD}
        SentReminder.objects.create(occurrence=now, offset=10, error='blocked', **common)
        SentReminder.objects.create(occurrence=now, offset=20, ok=True, **common)
        SentReminder.objects.create(occurrence=now, offset=30, **common)  # claimed, still being sent
        SentReminder.objects.create(occurrence=now, offset=40, error='x', sent_at=now - timedelta(days=8), **common)

        self.client.force_login(self.admin)
        response = self.client.get('/admin/')
        self.assertEqual(overview.overview()['reminders_failed'], 1)
        self.assertNotContains(response, 'Nelly')


class SnapshotUnchangedTests(TempStatusMixin, TransactionTestCase):
    serialized_rollback = True  # see kingdom.tests.BackupTests

    def test_worker_ticks_do_not_change_the_snapshot(self):
        from . import snapshot

        with override_settings(
            SNAPSHOT_PATH=self.folder / 'snapshot' / 'db.sqlite3', SNAPSHOT_BASE_PATH=self.folder / 'snapshot_base'
        ):
            snapshot.export_snapshot()
            before = (self.folder / 'snapshot' / 'db.sqlite3').read_bytes()
            with (
                mock.patch(f'{WORKER}.close_old_connections'),
                mock.patch(f'{WORKER}.backup_due', return_value=False),
                mock.patch('time.sleep', side_effect=[None, None, Stop]),
                self.assertRaises(Stop),
            ):
                call_command('run_worker')  # three ticks of the real loop
            self.assertIsNotNone(overview.read_status())
            self.assertFalse(snapshot.export_snapshot())
            self.assertEqual((self.folder / 'snapshot' / 'db.sqlite3').read_bytes(), before)

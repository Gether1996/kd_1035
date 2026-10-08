import base64
import io
import json
import sqlite3
import tempfile
import urllib.error
from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest import mock

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from django.contrib.auth.models import User
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.test import Client, SimpleTestCase, TestCase, TransactionTestCase, override_settings
from django.utils import timezone
from pywebpush import WebPushException

from guides.models import Guide
from kingdom import snapshot
from kingdom.models import KingdomEvent

from . import discord_bot, push, reminders
from .models import EventReminder, Player, PushSubscription, SentReminder, validate_offsets
from .reminder_views import MAX_DEVICES, WriteThrottle

BOT = {'DISCORD_BOT_TOKEN': 'bot-secret-token'}
VAPID = {'VAPID_PUBLIC_KEY': 'BPublicKey', 'VAPID_PRIVATE_KEY': 'private-key', 'VAPID_SUBJECT': 'https://kd1035.test'}
NO_CHANNELS = {'DISCORD_BOT_TOKEN': '', 'VAPID_PUBLIC_KEY': '', 'VAPID_PRIVATE_KEY': ''}
ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc:def'
KEYS = {
    'p256dh': 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
    'auth': 'tBHItJI5svbpez7KI4CCXg',
}
PLAIN_STATIC = {
    'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
    'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
}
Channel = SentReminder.Channel


def utc(*args):
    return datetime(*args, tzinfo=UTC)


def make_player(discord_id='80351110224678912', **kwargs):
    user = User.objects.create_user(f'discord_{discord_id}', **kwargs)
    return Player.objects.create(user=user, discord_id=discord_id, username='nelly', global_name='Nelly')


def make_event(**kwargs):
    defaults = {'name_sk': 'Ruiny', 'starts_at': utc(2026, 10, 10, 18), 'repeat_days': 7}
    return KingdomEvent.objects.create(**{**defaults, **kwargs})


class OffsetValidationTests(SimpleTestCase):
    def test_model_validators(self):
        for good in ([0], [10080], [60, 10], [1, 2, 3, 4, 5]):
            validate_offsets(good)
        for bad in ([], [1, 2, 3, 4, 5, 6], [10, 10], [-1], [10081], ['10'], [10.0], [True], None, 10):
            with self.subTest(bad), self.assertRaises(ValidationError):
                validate_offsets(bad)

    def test_offered_times_allow_up_to_six_or_none(self):
        from kingdom.models import validate_player_reminders

        for good in ([], [10, 60], [0, 5, 10, 30, 60, 1440]):
            validate_player_reminders(good)
        for bad in ([1, 2, 3, 4, 5, 6, 7], [60, 60], [10081], [True], 'x'):
            with self.subTest(bad), self.assertRaises(ValidationError):
                validate_player_reminders(bad)


class ApiTestCase(TestCase):
    def setUp(self):
        cache.clear()  # write throttle
        self.client = Client(enforce_csrf_checks=True)
        self.player = make_player()
        self.client.force_login(self.player.user)
        self.token = self.client.get('/api/auth/me/').cookies['csrftoken'].value

    def send(self, method, url, data=None, token=True):
        headers = {'HTTP_X_CSRFTOKEN': self.token} if token else {}
        body = json.dumps(data) if data is not None else ''
        return getattr(self.client, method)(url, body, content_type='application/json', **headers)


@mock.patch('django.utils.timezone.now', return_value=utc(2026, 10, 8, 12))
class RemindersApiTests(ApiTestCase):
    url = '/api/me/reminders/'

    @override_settings(**NO_CHANNELS)
    def test_list_without_channels(self, _now):
        weekly = make_event(player_reminders=[10, 60])
        once = make_event(name_sk='KvK', name_cs='KvK CZ', starts_at=utc(2026, 10, 9, 19), repeat_days=0)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertIn('no-store', response['Cache-Control'])
        self.assertEqual(
            response.json(),
            {
                'discord': True,
                'discord_available': False,
                'push_key': '',
                'push_devices': 0,
                'lang': 'sk',
                'events': [
                    {
                        'id': once.pk,
                        'name_sk': 'KvK',
                        'name_cs': 'KvK CZ',
                        'next_start': '2026-10-09T19:00:00Z',
                        'repeat_days': 0,
                        'offered': [10, 60],
                        'offsets': None,
                    },
                    {
                        'id': weekly.pk,
                        'name_sk': 'Ruiny',
                        'name_cs': '',
                        'next_start': '2026-10-10T18:00:00Z',
                        'repeat_days': 7,
                        'offered': [10, 60],
                        'offsets': None,
                    },
                ],
            },
        )

    @override_settings(**BOT, **VAPID)
    def test_channels_and_chosen_times(self, _now):
        event = make_event()
        EventReminder.objects.create(player=self.player, event=event, offsets=[60, 10])
        PushSubscription.objects.create(player=self.player, endpoint=ENDPOINT, **KEYS)
        data = self.client.get(self.url).json()
        self.assertTrue(data['discord_available'])
        self.assertEqual(data['push_key'], 'BPublicKey')
        self.assertEqual(data['push_devices'], 1)
        self.assertEqual(data['events'][0]['offsets'], [60, 10])

    def test_only_active_visible_and_upcoming_events(self, _now):
        visible = make_event()
        make_event(name_sk='Neaktívny', is_active=False)
        make_event(name_sk='Skrytý', show_on_web=False)
        make_event(name_sk='Prešiel', starts_at=utc(2026, 10, 1, 18), repeat_days=0)
        make_event(name_sk='Skončil', starts_at=utc(2026, 9, 1, 18), until=datetime(2026, 10, 1).date())
        self.assertEqual([e['id'] for e in self.client.get(self.url).json()['events']], [visible.pk])

    def test_subscribe_change_and_unsubscribe(self, _now):
        event = make_event()
        url = f'{self.url}{event.pk}/'
        response = self.send('put', url, {'offsets': [10, 1440, 10, 0]})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['offsets'], [1440, 10, 0])  # unique, largest first
        self.assertEqual(response.json()['next_start'], '2026-10-10T18:00:00Z')
        self.assertEqual(EventReminder.objects.get().offsets, [1440, 10, 0])

        self.assertEqual(self.send('put', url, {'offsets': [25]}).status_code, 200)  # own time, not offered
        self.assertEqual(EventReminder.objects.get().offsets, [25])

        self.assertEqual(self.send('delete', url).status_code, 204)
        self.assertFalse(EventReminder.objects.exists())
        self.assertEqual(self.send('delete', url).status_code, 204)  # already gone

    def test_invalid_offsets(self, _now):
        url = f'{self.url}{make_event().pk}/'
        bad = [
            {'offsets': []},
            {'offsets': [1, 2, 3, 4, 5, 6]},
            {'offsets': [-1]},
            {'offsets': [10081]},
            {'offsets': ['10']},
            {'offsets': [10.5]},
            {'offsets': [True]},
            {'offsets': None},
            {'offsets': 10},
            {},
            [10],
        ]
        for data in bad:
            with self.subTest(data):
                response = self.send('put', url, data)
                self.assertEqual(response.status_code, 400)
        self.assertFalse(EventReminder.objects.exists())

    def test_hidden_events_are_404(self, _now):
        for event in (make_event(is_active=False), make_event(show_on_web=False)):
            with self.subTest(event=event.pk):
                EventReminder.objects.create(player=self.player, event=event, offsets=[10])
                self.assertEqual(self.send('put', f'{self.url}{event.pk}/', {'offsets': [10]}).status_code, 404)
                self.assertEqual(self.send('delete', f'{self.url}{event.pk}/').status_code, 404)
        self.assertEqual(self.send('put', f'{self.url}999999/', {'offsets': [10]}).status_code, 404)

    def test_settings(self, _now):
        response = self.send('patch', self.url, {'discord': False, 'lang': 'cs'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'discord': False, 'lang': 'cs'})
        self.player.refresh_from_db()
        self.assertEqual((self.player.remind_discord, self.player.lang), (False, 'cs'))
        self.assertEqual(self.send('patch', self.url, {'lang': 'sk'}).json(), {'discord': False, 'lang': 'sk'})
        self.assertEqual(self.send('patch', self.url, {'lang': 'en'}).status_code, 400)
        self.assertEqual(self.send('patch', self.url, {'discord': 'maybe'}).status_code, 400)
        self.player.refresh_from_db()
        self.assertEqual(self.player.lang, 'sk')

    def test_writes_need_csrf(self, _now):
        event = make_event()
        self.assertEqual(self.send('put', f'{self.url}{event.pk}/', {'offsets': [10]}, token=False).status_code, 403)
        self.assertEqual(self.send('patch', self.url, {'discord': False}, token=False).status_code, 403)
        push_data = {'endpoint': ENDPOINT, 'keys': KEYS}
        self.assertEqual(self.send('post', '/api/me/push/', push_data, token=False).status_code, 403)
        self.assertFalse(EventReminder.objects.exists())
        self.assertFalse(PushSubscription.objects.exists())

    def test_anonymous_and_password_admins_are_refused(self, _now):
        event = make_event()
        calls = [
            ('get', self.url, None),
            ('patch', self.url, {'discord': False}),
            ('put', f'{self.url}{event.pk}/', {'offsets': [10]}),
            ('delete', f'{self.url}{event.pk}/', None),
            ('post', '/api/me/push/', {'endpoint': ENDPOINT, 'keys': KEYS}),
            ('delete', '/api/me/push/', {'endpoint': ENDPOINT}),
        ]
        self.client.logout()
        for user in (None, User.objects.create_superuser('boss', password='x')):
            if user:
                self.client.force_login(user)
            # a valid CSRF token, so the refusal comes from the permission check
            self.token = self.client.get('/api/auth/me/').cookies['csrftoken'].value
            for method, url, data in calls:
                with self.subTest(user=user and user.username, method=method, url=url):
                    self.assertEqual(self.send(method, url, data).status_code, 403)
        self.assertFalse(EventReminder.objects.exists())

    def test_writes_are_throttled_per_player(self, _now):
        event = make_event()
        with mock.patch.object(WriteThrottle, 'rate', '3/minute'):
            for _ in range(3):
                self.assertEqual(self.send('put', f'{self.url}{event.pk}/', {'offsets': [10]}).status_code, 200)
            self.assertEqual(self.send('put', f'{self.url}{event.pk}/', {'offsets': [10]}).status_code, 429)
            self.assertEqual(self.client.get(self.url).status_code, 200)  # reading is not limited


class PushApiTests(ApiTestCase):
    url = '/api/me/push/'

    def test_subscribe_upsert_and_unsubscribe(self):
        response = self.send('post', self.url, {'endpoint': ENDPOINT, 'expirationTime': None, 'keys': KEYS})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json(), {'push_devices': 1})
        sub = PushSubscription.objects.get()
        self.assertEqual((sub.player, sub.p256dh, sub.auth), (self.player, KEYS['p256dh'], KEYS['auth']))

        # the same browser again (every visit of /ucet) with renewed keys
        PushSubscription.objects.update(failures=3)
        response = self.send('post', self.url, {'endpoint': ENDPOINT, 'keys': {**KEYS, 'auth': 'newAuth'}})
        self.assertEqual(response.status_code, 200)
        sub.refresh_from_db()
        self.assertEqual((sub.auth, sub.failures), ('newAuth', 0))

        response = self.send('delete', self.url, {'endpoint': ENDPOINT})
        self.assertEqual(response.json(), {'push_devices': 0})
        self.assertFalse(PushSubscription.objects.exists())

    def test_endpoint_moves_to_the_player_signed_in_now(self):
        other = make_player('90351110224678912')
        PushSubscription.objects.create(player=other, endpoint=ENDPOINT, **KEYS)
        self.assertEqual(self.send('post', self.url, {'endpoint': ENDPOINT, 'keys': KEYS}).status_code, 200)
        self.assertEqual(PushSubscription.objects.get().player, self.player)

    def test_delete_only_own_subscription(self):
        other = make_player('90351110224678912')
        PushSubscription.objects.create(player=other, endpoint=ENDPOINT, **KEYS)
        self.assertEqual(self.send('delete', self.url, {'endpoint': ENDPOINT}).status_code, 200)
        self.assertTrue(PushSubscription.objects.exists())
        self.assertEqual(self.send('delete', self.url, {}).status_code, 400)

    def test_only_push_services_and_valid_keys(self):
        bad = [
            {'endpoint': 'https://evil.example/push', 'keys': KEYS},
            {'endpoint': 'http://fcm.googleapis.com/fcm/send/x', 'keys': KEYS},
            {'endpoint': 'https://fcm.googleapis.com.evil.example/x', 'keys': KEYS},
            {'endpoint': 'https://fcm.googleapis.com:8443/x', 'keys': KEYS},
            {'endpoint': 'https://user@fcm.googleapis.com/x', 'keys': KEYS},
            {'endpoint': ENDPOINT + 'x' * 500, 'keys': KEYS},
            {'endpoint': ENDPOINT, 'keys': {'p256dh': '<script>', 'auth': KEYS['auth']}},
            {'endpoint': ENDPOINT, 'keys': {'p256dh': KEYS['p256dh']}},
            {'endpoint': ENDPOINT},
        ]
        for data in bad:
            with self.subTest(data):
                self.assertEqual(self.send('post', self.url, data).status_code, 400)
        self.assertFalse(PushSubscription.objects.exists())

    def test_oldest_devices_beyond_the_limit_are_dropped(self):
        for i in range(MAX_DEVICES + 2):
            self.send('post', self.url, {'endpoint': f'{ENDPOINT}{i}', 'keys': KEYS})
        endpoints = set(PushSubscription.objects.values_list('endpoint', flat=True))
        self.assertEqual(len(endpoints), MAX_DEVICES)
        self.assertNotIn(f'{ENDPOINT}0', endpoints)
        self.assertIn(f'{ENDPOINT}{MAX_DEVICES + 1}', endpoints)


class AllowedEndpointTests(SimpleTestCase):
    def test_push_services(self):
        for url in (
            ENDPOINT,
            'https://updates.push.services.mozilla.com/wpush/v2/gAAAA',
            'https://wns2-par02p.notify.windows.com/w/?token=BQYAAA',
            'https://web.push.apple.com/QGuQyavXutnMH',
        ):
            self.assertTrue(push.allowed_endpoint(url), url)
        for url in ('https://localhost/x', 'https://127.0.0.1/x', 'https://fcm.googleapis.com:abc/x', 'ftp://x'):
            self.assertFalse(push.allowed_endpoint(url), url)


class MessageTests(TestCase):
    def setUp(self):
        self.event = make_event(name_cs='Ruiny CZ')

    def test_duration(self):
        cases = {0: '0 min', 10: '10 min', 60: '1 h', 90: '1 h 30 min', 1440: '1 deň', 2880: '2 dni', 7200: '5 dní'}
        for minutes, text in cases.items():
            self.assertEqual(reminders.duration(minutes, 'sk'), text)
        self.assertEqual(reminders.duration(1440, 'cs'), '1 den')
        self.assertEqual(reminders.duration(4320, 'cs'), '3 dny')
        self.assertEqual(reminders.duration(10080, 'cs'), '7 dní')

    @override_settings(SITE_URL='https://kd1035.test')
    def test_discord_message_in_the_players_language(self):
        start = utc(2026, 10, 10, 18)
        unix = int(start.timestamp())
        embed = reminders.discord_message(self.event, start, 'sk')['embeds'][0]
        self.assertEqual(embed['title'], 'Ruiny')
        self.assertIn(f'<t:{unix}:F>', embed['description'])
        self.assertIn(f'<t:{unix}:R>', embed['description'])
        self.assertIn('[Zmeniť pripomienky](https://kd1035.test/ucet)', embed['description'])
        self.assertNotIn('url', embed)

        self.event.guide = Guide.objects.create(
            category='eventy', title_sk='Ruiny', slug='ruiny-x', html_sk='<p>x</p>'
        )
        embed = reminders.discord_message(self.event, start, 'cs')['embeds'][0]
        self.assertEqual(embed['title'], 'Ruiny CZ')
        self.assertEqual(embed['url'], 'https://kd1035.test/cz/navody/eventy/ruiny-x')
        self.assertIn('Začátek:', embed['description'])
        self.assertIn('(https://kd1035.test/cz/ucet)', embed['description'])

    def test_push_payload_uses_bratislava_time(self):
        start = utc(2026, 10, 10, 18)  # 20:00 in Bratislava (summer time)
        same_day = utc(2026, 10, 10, 17, 50)
        self.assertEqual(
            reminders.push_payload(self.event, start, 'sk', same_day),
            {'title': 'Ruiny', 'body': 'Začína o 10 min · 20:00', 'url': '/ucet'},
        )
        self.assertEqual(
            reminders.push_payload(self.event, start, 'cs', utc(2026, 10, 9, 18)),
            {'title': 'Ruiny CZ', 'body': 'Začíná za 1 den · 10. 10. 20:00', 'url': '/cz/ucet'},
        )
        self.assertEqual(reminders.push_payload(self.event, start, 'sk', start)['body'], 'Začína teraz · 20:00')
        # sent late: the time actually left, rounded up to whole minutes
        late = utc(2026, 10, 10, 17, 54, 30)
        self.assertEqual(reminders.push_payload(self.event, start, 'sk', late)['body'], 'Začína o 6 min · 20:00')
        self.event.guide = Guide.objects.create(
            category='eventy', title_sk='Ruiny', slug='ruiny-y', html_sk='<p>x</p>', is_published=False
        )
        self.assertEqual(reminders.push_payload(self.event, start, 'sk', same_day)['url'], '/ucet')
        self.event.guide.is_published = True
        self.assertEqual(
            reminders.push_payload(self.event, start, 'sk', same_day)['url'], '/navody/eventy/ruiny-y'
        )


@override_settings(**BOT, **VAPID)
class SendRemindersTests(TestCase):
    """The event starts on Saturday 10. 10. 2026 at 18:00 UTC (20:00 in Bratislava)."""

    start = utc(2026, 10, 10, 18)

    def setUp(self):
        self.player = make_player()
        self.event = make_event()
        self.reminder = EventReminder.objects.create(player=self.player, event=self.event, offsets=[60, 10])
        self.device = PushSubscription.objects.create(player=self.player, endpoint=ENDPOINT, **KEYS)
        self.dm = self.patch('accounts.discord_bot.send_dm')
        self.push = self.patch('accounts.push.send')

    def patch(self, target, **kwargs):
        patcher = mock.patch(target, **kwargs)
        self.addCleanup(patcher.stop)
        return patcher.start()

    def run_at(self, *args):
        return reminders.send_personal_reminders(now=utc(*args))

    def sent(self):
        return sorted(SentReminder.objects.values_list('offset', 'channel', 'ok'))

    def test_sends_once_per_channel_within_the_window(self):
        self.assertEqual(self.run_at(2026, 10, 10, 16, 59), 0)  # 61 min before
        self.assertEqual(self.run_at(2026, 10, 10, 17, 0), 2)  # 60 min: Discord + push
        self.assertEqual(self.dm.call_count, 1)
        self.assertEqual(self.dm.call_args.args[0], '80351110224678912')
        self.assertEqual(self.push.call_count, 1)
        subscription, payload, ttl = self.push.call_args.args
        self.assertEqual((subscription, payload['body'], ttl), (self.device, 'Začína o 1 h · 20:00', 3600))
        self.assertEqual(self.sent(), [(60, Channel.DISCORD, True), (60, Channel.PUSH, True)])

        # next ticks of the worker
        self.assertEqual(self.run_at(2026, 10, 10, 17, 0, 30), 0)
        self.assertEqual(self.run_at(2026, 10, 10, 17, 9, 59), 0)
        self.assertEqual(self.run_at(2026, 10, 10, 17, 50, 20), 2)  # 10 min before
        self.assertEqual((self.dm.call_count, self.push.call_count), (2, 2))
        self.device.refresh_from_db()
        self.assertEqual(self.device.last_used_at, utc(2026, 10, 10, 17, 50, 20))

    def test_reminder_more_than_ten_minutes_late_is_skipped(self):
        self.assertEqual(self.run_at(2026, 10, 10, 17, 10, 1), 0)  # the 60-min one is 10 min 1 s late
        self.assertEqual(self.run_at(2026, 10, 10, 17, 59, 59), 2)  # the 10-min one is 9 min 59 s late
        self.assertEqual([o for o, _, _ in self.sent()], [10, 10])

    def test_weekly_occurrences_utc_and_local(self):
        # the week after the end of summer time: UTC events stay at 18:00 UTC, local ones at 20:00 Bratislava
        local = make_event(name_sk='Lokálny', time_basis=KingdomEvent.TimeBasis.LOCAL)
        EventReminder.objects.create(player=self.player, event=local, offsets=[10])
        self.reminder.offsets = [10]
        self.reminder.save()
        PushSubscription.objects.all().delete()
        self.run_at(2026, 10, 31, 17, 50)
        self.run_at(2026, 10, 31, 18, 50)
        self.assertEqual(
            sorted(SentReminder.objects.values_list('event__name_sk', 'occurrence')),
            [('Lokálny', utc(2026, 10, 31, 19)), ('Ruiny', utc(2026, 10, 31, 18))],
        )

    def test_discord_failure_is_recorded_and_not_retried(self):
        self.dm.side_effect = discord_bot.BotError('Hráč nemá povolené súkromné správy.')
        with self.assertLogs('accounts.reminders', 'WARNING') as logs:
            self.run_at(2026, 10, 10, 17, 0)
        self.assertNotIn('bot-secret-token', ''.join(logs.output))
        row = SentReminder.objects.get(channel=Channel.DISCORD)
        self.assertEqual((row.ok, row.error), (False, 'Hráč nemá povolené súkromné správy.'))
        self.run_at(2026, 10, 10, 17, 1)
        self.assertEqual(self.dm.call_count, 1)
        self.assertTrue(SentReminder.objects.get(channel=Channel.PUSH).ok)

    def test_discord_rate_limit_retries_on_the_next_tick(self):
        self.dm.side_effect = discord_bot.BotError('Discord limit (429), skúsiť o 1.5 s', temporary=True)
        other = make_player('90351110224678912')
        EventReminder.objects.create(player=other, event=self.event, offsets=[60])
        with self.assertLogs('accounts.reminders', 'WARNING'):
            self.run_at(2026, 10, 10, 17, 0)
        # Discord paused after the first refusal; push went out first and is logged
        self.assertEqual(self.dm.call_count, 1)
        self.assertEqual(self.sent(), [(60, Channel.PUSH, True)])

        self.dm.side_effect = None
        self.run_at(2026, 10, 10, 17, 0, 30)
        self.assertEqual(self.dm.call_count, 3)  # both players, half a minute later
        self.assertEqual(SentReminder.objects.filter(channel=Channel.DISCORD, ok=True).count(), 2)

    def test_withdrawn_push_subscription_is_deleted(self):
        self.push.side_effect = push.PushError('Push služba odpovedala 410', gone=True)
        with self.assertLogs('accounts.reminders', 'WARNING'):
            self.run_at(2026, 10, 10, 17, 0)
        self.assertFalse(PushSubscription.objects.exists())
        self.assertEqual(SentReminder.objects.get(channel=Channel.PUSH).ok, False)
        self.assertTrue(SentReminder.objects.get(channel=Channel.DISCORD).ok)

    def test_failing_push_subscription_is_dropped_after_five_errors(self):
        self.push.side_effect = push.PushError('Push služba odpovedala 500')
        self.reminder.offsets = [10, 20, 30, 40, 50]
        self.reminder.save()
        with self.assertLogs('accounts.reminders', 'WARNING'):
            for minute in (10, 20, 30, 40):
                self.run_at(2026, 10, 10, 17, minute)
        self.assertEqual(PushSubscription.objects.get().failures, 4)
        with self.assertLogs('accounts.reminders', 'WARNING'):
            self.run_at(2026, 10, 10, 17, 50)
        self.assertFalse(PushSubscription.objects.exists())

    def test_unexpected_error_does_not_stop_the_round(self):
        other = make_player('90351110224678912')
        EventReminder.objects.create(player=other, event=self.event, offsets=[60])
        self.dm.side_effect = [RuntimeError('bug'), None]
        PushSubscription.objects.all().delete()
        with self.assertLogs('accounts.reminders', 'ERROR'):
            self.assertEqual(self.run_at(2026, 10, 10, 17, 0), 2)
        self.assertEqual(sorted(SentReminder.objects.values_list('ok', flat=True)), [False, True])

    def test_browser_switched_off_meanwhile(self):
        def switch_off(subscription, payload, ttl):
            PushSubscription.objects.filter(pk=subscription.pk).delete()  # DELETE /api/me/push/ at the same moment
            raise push.PushError('Push služba odpovedala 500')

        self.push.side_effect = switch_off
        with self.assertLogs('accounts.reminders', 'WARNING'):
            self.run_at(2026, 10, 10, 17, 0)
        self.assertFalse(PushSubscription.objects.exists())
        self.assertEqual(SentReminder.objects.get(channel=Channel.PUSH).error, 'Push služba odpovedala 500')

    def test_one_working_device_is_enough(self):
        PushSubscription.objects.create(player=self.player, endpoint=ENDPOINT + '2', **KEYS)
        self.push.side_effect = [push.PushError('Push služba odpovedala 500'), None]
        with self.assertLogs('accounts.reminders', 'WARNING'):
            self.run_at(2026, 10, 10, 17, 0)
        row = SentReminder.objects.get(channel=Channel.PUSH)
        self.assertEqual((row.ok, row.error), (True, 'Push služba odpovedala 500'))

    def test_player_choices(self):
        self.player.remind_discord = False
        self.player.save()
        PushSubscription.objects.all().delete()
        self.assertEqual(self.run_at(2026, 10, 10, 17, 0), 0)  # Discord off, no browser
        self.player.remind_discord = True
        self.player.save()
        self.player.user.is_active = False  # blocked in the admin
        self.player.user.save()
        self.assertEqual(self.run_at(2026, 10, 10, 17, 0), 0)
        self.assertFalse(SentReminder.objects.exists())

    def test_inactive_or_hidden_event_sends_nothing(self):
        for changes in ({'is_active': False}, {'show_on_web': False}):
            with self.subTest(**changes):
                visible = {'is_active': True, 'show_on_web': True}
                KingdomEvent.objects.filter(pk=self.event.pk).update(**{**visible, **changes})
                self.assertEqual(self.run_at(2026, 10, 10, 17, 0), 0)
        self.dm.assert_not_called()

    @override_settings(**NO_CHANNELS)
    def test_nothing_is_sent_without_configured_channels(self):
        self.assertEqual(self.run_at(2026, 10, 10, 17, 0), 0)
        self.assertFalse(SentReminder.objects.exists())

    @override_settings(DISCORD_BOT_TOKEN='')
    def test_push_only(self):
        self.assertEqual(self.run_at(2026, 10, 10, 17, 0), 1)
        self.assertEqual(self.sent(), [(60, Channel.PUSH, True)])

    def test_messages_in_the_players_language(self):
        self.player.lang = 'cs'
        self.player.save()
        self.event.name_cs = 'Ruiny CZ'
        self.event.save()
        self.run_at(2026, 10, 10, 17, 0)
        self.assertEqual(self.dm.call_args.args[1]['embeds'][0]['title'], 'Ruiny CZ')
        self.assertEqual(self.push.call_args.args[1]['body'], 'Začíná za 1 h · 20:00')

    def test_prune_keeps_thirty_days(self):
        self.run_at(2026, 10, 10, 17, 0)
        SentReminder.objects.filter(channel=Channel.DISCORD).update(sent_at=timezone.now() - timedelta(days=31))
        self.assertEqual(reminders.prune_sent(), 1)
        self.assertEqual(list(SentReminder.objects.values_list('channel', flat=True)), [Channel.PUSH])

    def test_prune_drops_choices_for_events_that_are_over(self):
        # a one-off event (no repeat) that already took place: the choice has no purpose any more
        self.event.repeat_days = 0
        self.event.save()
        reminders.prune_sent(now=utc(2026, 10, 10, 17))
        self.assertTrue(EventReminder.objects.exists())  # still ahead
        reminders.prune_sent(now=utc(2026, 10, 10, 19))
        self.assertFalse(EventReminder.objects.exists())


@override_settings(**BOT)
class DiscordBotTests(SimpleTestCase):
    def response(self, data):
        return io.BytesIO(json.dumps(data).encode())

    def refused(self, code, body):
        return urllib.error.HTTPError('https://discord.com', code, 'Error', {}, io.BytesIO(json.dumps(body).encode()))

    def test_opens_the_dm_channel_and_posts(self):
        answers = [self.response({'id': '1234567890123'}), self.response({'id': '99'})]
        with mock.patch('urllib.request.urlopen', side_effect=answers) as urlopen:
            discord_bot.send_dm('80351110224678912', {'embeds': [{'title': 'Ruiny'}]})
        opened, posted = (c.args[0] for c in urlopen.call_args_list)
        self.assertEqual(opened.full_url, 'https://discord.com/api/v10/users/@me/channels')
        self.assertEqual(json.loads(opened.data), {'recipient_id': '80351110224678912'})
        self.assertEqual(opened.get_header('Authorization'), 'Bot bot-secret-token')
        self.assertTrue(opened.get_header('User-agent').startswith('KD1035Bot'))
        self.assertEqual(posted.full_url, 'https://discord.com/api/v10/channels/1234567890123/messages')
        self.assertEqual(json.loads(posted.data), {'embeds': [{'title': 'Ruiny'}], 'allowed_mentions': {'parse': []}})

    def test_errors_without_the_token(self):
        cases = [
            (self.refused(403, {'message': 'Cannot send messages to this user', 'code': 50007}), 'súkromné správy'),
            (self.refused(429, {'message': 'You are being rate limited.', 'retry_after': 1.5}), 'o 1.5 s'),
            (self.refused(401, {'message': '401: Unauthorized'}), 'Discord odpovedal 401'),
            (self.refused(502, {}), 'Discord odpovedal 502'),
            (urllib.error.URLError('down'), 'nedostupný'),
        ]
        temporary = {'o 1.5 s', 'Discord odpovedal 502', 'nedostupný'}
        for side_effect, text in cases:
            with self.subTest(text), mock.patch('urllib.request.urlopen', side_effect=side_effect):
                with self.assertRaises(discord_bot.BotError) as ctx:
                    discord_bot.send_dm('80351110224678912', {'content': 'x'})
                self.assertIn(text, str(ctx.exception))
                self.assertEqual(ctx.exception.temporary, text in temporary)
                self.assertNotIn('bot-secret-token', str(ctx.exception))

    @override_settings(DISCORD_BOT_TOKEN='')
    def test_disabled_without_token(self):
        self.assertFalse(discord_bot.enabled())
        with mock.patch('urllib.request.urlopen') as urlopen, self.assertRaises(discord_bot.BotError):
            discord_bot.send_dm('80351110224678912', {'content': 'x'})
        urlopen.assert_not_called()


@override_settings(**VAPID)
class WebPushTests(SimpleTestCase):
    def setUp(self):
        self.device = PushSubscription(endpoint=ENDPOINT, **KEYS)

    def test_send_encrypts_with_vapid(self):
        with mock.patch('accounts.push.webpush') as webpush:
            push.send(self.device, {'title': 'Ruiny', 'body': 'x', 'url': '/ucet'}, ttl=900)
        kwargs = webpush.call_args.kwargs
        self.assertEqual(kwargs['subscription_info'], {'endpoint': ENDPOINT, 'keys': KEYS})
        self.assertEqual(json.loads(kwargs['data']), {'title': 'Ruiny', 'body': 'x', 'url': '/ucet'})
        self.assertEqual(kwargs['vapid_private_key'], 'private-key')
        self.assertEqual(kwargs['vapid_claims'], {'sub': 'https://kd1035.test'})
        self.assertEqual(kwargs['ttl'], 900)

    def test_errors(self):
        def refused(status):
            return WebPushException('Push failed', response=mock.Mock(status_code=status, text='gone'))

        cases = ((refused(410), True), (refused(404), True), (refused(500), False), (OSError(), False))
        for side_effect, gone in cases:
            with self.subTest(side_effect), mock.patch('accounts.push.webpush', side_effect=side_effect):
                with self.assertRaises(push.PushError) as ctx:
                    push.send(self.device, {}, ttl=60)
                self.assertEqual(ctx.exception.gone, gone)
                self.assertNotIn(ENDPOINT, str(ctx.exception))

    def test_public_key_only_when_configured(self):
        self.assertEqual(push.public_key(), 'BPublicKey')
        with override_settings(VAPID_PRIVATE_KEY=''):
            self.assertEqual(push.public_key(), '')


class GenerateVapidKeysTests(SimpleTestCase):
    def test_prints_a_matching_key_pair(self):
        out = io.StringIO()
        call_command('generate_vapid_keys', stdout=out, stderr=io.StringIO())
        lines = dict(line.split('=', 1) for line in out.getvalue().splitlines())
        self.assertEqual(set(lines), {'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'})

        def decode(text):
            return base64.urlsafe_b64decode(text + '=' * (-len(text) % 4))

        public, private = decode(lines['VAPID_PUBLIC_KEY']), decode(lines['VAPID_PRIVATE_KEY'])
        self.assertEqual((len(public), len(private)), (65, 32))
        key = ec.derive_private_key(int.from_bytes(private, 'big'), ec.SECP256R1())
        self.assertEqual(
            key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint),
            public,
        )
        self.assertTrue(lines['VAPID_SUBJECT'].startswith('https://'))


@override_settings(STORAGES=PLAIN_STATIC)
class ReminderAdminTests(TestCase):
    url = '/admin/accounts/eventreminder/'

    def setUp(self):
        self.player = make_player()
        Player.objects.filter(pk=self.player.pk).update(ingame_name='GetheR')
        self.event = make_event()
        self.reminder = EventReminder.objects.create(player=self.player, event=self.event, offsets=[1440, 90, 0])
        PushSubscription.objects.create(player=self.player, endpoint=ENDPOINT, **KEYS)
        self.admin = User.objects.create_superuser('boss', password='x')

    def test_superuser_sees_who_subscribed(self):
        self.client.force_login(User.objects.create_user('r4', password='x', is_staff=True))
        self.assertEqual(self.client.get(self.url).status_code, 403)
        self.client.force_login(self.admin)
        response = self.client.get(self.url)
        self.assertContains(response, 'Nelly')
        self.assertContains(response, 'GetheR')
        self.assertContains(response, '1 deň, 1 h 30 min, pri začiatku')
        self.assertEqual(self.client.get(f'{self.url}add/').status_code, 403)
        detail = self.client.get(f'{self.url}{self.reminder.pk}/change/')
        self.assertEqual(detail.status_code, 200)
        self.assertNotContains(detail, 'name="offsets"')  # read only
        # push subscriptions are not in the admin at all
        self.assertEqual(self.client.get('/admin/accounts/pushsubscription/').status_code, 404)
        self.assertNotContains(self.client.get('/admin/accounts/player/'), KEYS['auth'])

    def test_superuser_sees_failed_deliveries(self):
        self.client.force_login(self.admin)
        SentReminder.objects.create(
            player=self.player, event=self.event, occurrence=utc(2026, 10, 10, 18), offset=10,
            channel=SentReminder.Channel.DISCORD, error='Hráč nemá povolené súkromné správy.',
        )  # fmt: skip
        response = self.client.get('/admin/accounts/sentreminder/', {'ok__exact': '0'})
        self.assertContains(response, 'Hráč nemá povolené súkromné správy.')
        self.assertEqual(self.client.get('/admin/accounts/sentreminder/add/').status_code, 403)

    def test_deleting_a_subscribed_player_or_event_still_works(self):
        self.client.force_login(self.admin)
        response = self.client.post(f'/admin/accounts/player/{self.player.pk}/delete/', {'post': 'yes'})
        self.assertEqual(response.status_code, 302)
        self.assertFalse(EventReminder.objects.exists())
        self.assertFalse(PushSubscription.objects.exists())
        other = make_player('90351110224678912')
        EventReminder.objects.create(player=other, event=self.event, offsets=[10])
        response = self.client.post(f'/admin/kingdom/kingdomevent/{self.event.pk}/delete/', {'post': 'yes'})
        self.assertEqual(response.status_code, 302)
        self.assertFalse(EventReminder.objects.exists())


class SnapshotPrivacyTests(TransactionTestCase):
    serialized_rollback = True  # starts with the content seeded by migrations, like a real database

    def test_export_contains_no_reminders_or_push_subscriptions(self):
        player = make_player()
        event = make_event()
        EventReminder.objects.create(player=player, event=event, offsets=[10])
        PushSubscription.objects.create(player=player, endpoint=ENDPOINT, **KEYS)
        SentReminder.objects.create(player=player, event=event, occurrence=event.starts_at, offset=10, channel='push')

        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            path = folder / 'db.sqlite3'
            with override_settings(SNAPSHOT_PATH=path, SNAPSHOT_BASE_PATH=folder / 'base'):
                self.assertTrue(snapshot.export_snapshot())
                conn = sqlite3.connect(path)
                try:
                    for table in ('accounts_eventreminder', 'accounts_pushsubscription', 'accounts_sentreminder'):
                        self.assertEqual(conn.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0], 0, table)
                    # the event itself is site content and stays
                    self.assertEqual(conn.execute('SELECT COUNT(*) FROM kingdom_kingdomevent').fetchone()[0], 1)
                    dump = '\n'.join(conn.iterdump())
                finally:
                    conn.close()
        self.assertNotIn(ENDPOINT, dump)
        self.assertNotIn(KEYS['auth'], dump)

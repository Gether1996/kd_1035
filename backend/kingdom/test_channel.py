import json
from datetime import UTC, datetime
from unittest import mock

from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.test import TestCase, override_settings

from . import discord
from .models import EVENING_BEFORE, EventNotification, KingdomEvent

DAY = 24 * 60


def utc(*args):
    return datetime(*args, tzinfo=UTC)


# Thursday 29 October 2026, 12:00 UTC
NOW = utc(2026, 10, 29, 12)


@override_settings(DISCORD_WEBHOOK_URL='https://discord.test/hook')
@mock.patch('django.utils.timezone.now', return_value=NOW)
class ChannelApiTests(TestCase):
    """The superadmin's channel reminders on /pripomienky (Gether 29. 10. 2026): any times like a player's own,
    @everyone, the same rows the worker sends."""

    def setUp(self):
        self.gh = KingdomEvent.objects.create(
            name_sk='20 GH', starts_at=utc(2026, 10, 30), repeat_days=14, duration_minutes=2 * DAY, notify_discord=False
        )
        self.url = f'/api/events/channel/{self.gh.pk}/'

    def call(self, method, url, data=None):
        return getattr(self.client, method)(url, json.dumps(data or {}), content_type='application/json')

    def login(self):
        self.client.force_login(User.objects.create_superuser('gether', password='x'))

    def test_only_a_superuser(self, _now):
        self.assertEqual(self.client.get('/api/events/channel/').status_code, 403)
        User.objects.create_user('player', password='x')
        self.client.login(username='player', password='x')
        self.assertEqual(self.client.get('/api/events/channel/').status_code, 403)
        self.assertEqual(self.call('put', self.url, {'offsets': [10]}).status_code, 403)
        self.gh.refresh_from_db()
        self.assertFalse(self.gh.notify_discord)

    def test_lists_active_events_with_the_channel_times(self, _now):
        self.login()
        KingdomEvent.objects.create(name_sk='Vypnutý', starts_at=utc(2026, 11, 1), is_active=False)
        hidden = KingdomEvent.objects.create(
            name_sk='Skrytý', starts_at=utc(2026, 11, 2), show_on_web=False, reminders=[EVENING_BEFORE, 60]
        )
        data = self.client.get('/api/events/channel/').json()
        self.assertTrue(data['webhook'])
        rows = {row['name_sk']: row for row in data['events']}
        self.assertEqual(list(rows), ['20 GH', 'Skrytý'])
        self.assertIsNone(rows['20 GH']['offsets'])
        self.assertEqual(rows['Skrytý']['offsets'], [EVENING_BEFORE, 60])
        self.assertEqual((rows['Skrytý']['id'], rows['Skrytý']['everyone']), (hidden.pk, False))
        self.assertIn(15, rows['20 GH']['offered'])

    def test_put_sets_any_times_with_everyone_and_plans_them(self, _now):
        self.login()
        response = self.call('put', self.url, {'offsets': [10, EVENING_BEFORE], 'everyone': True})
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual((response.json()['offsets'], response.json()['everyone']), ([EVENING_BEFORE, 10], True))
        self.gh.refresh_from_db()
        self.assertTrue(self.gh.notify_discord and self.gh.mention_everyone)
        sent = sorted(EventNotification.objects.filter(event=self.gh).values_list('send_at', flat=True))
        # 18:00 in Bratislava (17:00 UTC in winter) the day before and 10 minutes before 00:00 UTC
        self.assertEqual(sent, [utc(2026, 10, 29, 17), utc(2026, 10, 29, 23, 50)])

    def test_bad_times_are_refused(self, _now):
        self.login()
        for offsets in ([], [-5], [10] * 2 + [1, 2, 3, 4], 'x'):
            self.assertEqual(self.call('put', self.url, {'offsets': offsets}).status_code, 400, offsets)
        self.assertEqual(self.call('patch', self.url, {'everyone': 'maybe'}).status_code, 400)

    def test_patch_everyone_keeps_the_planned_rows(self, _now):
        self.login()
        self.call('put', self.url, {'offsets': [10]})
        planned = list(EventNotification.objects.values_list('pk', flat=True))
        response = self.call('patch', self.url, {'everyone': True})
        self.assertTrue(response.json()['everyone'])
        self.assertEqual(list(EventNotification.objects.values_list('pk', flat=True)), planned)

    def test_delete_switches_the_channel_off_and_drops_pending_rows(self, _now):
        self.login()
        self.call('put', self.url, {'offsets': [10, 60]})
        self.assertTrue(EventNotification.objects.exists())
        self.assertEqual(self.call('delete', self.url).status_code, 204)
        self.gh.refresh_from_db()
        self.assertFalse(self.gh.notify_discord)
        self.assertEqual(self.gh.reminders, [60, 10])
        self.assertFalse(EventNotification.objects.filter(status=EventNotification.Status.PENDING).exists())
        self.assertIsNone(self.client.get('/api/events/channel/').json()['events'][0]['offsets'])

    def test_inactive_event_is_404(self, _now):
        self.login()
        self.gh.is_active = False
        self.gh.save()
        self.assertEqual(self.call('put', self.url, {'offsets': [10]}).status_code, 404)


class ChannelMessageTests(TestCase):
    def notification(self, **event):
        gh = KingdomEvent.objects.create(**{'name_sk': '20 GH', 'starts_at': utc(2026, 10, 30), **event})
        return EventNotification(title='20 GH', send_at=NOW, event=gh, event_start=gh.starts_at)

    @override_settings(DISCORD_EVENT_ROLE_ID='42')
    def test_everyone_wins_over_the_role(self):
        payload = discord.build_payload(self.notification(mention_everyone=True))
        self.assertEqual((payload['content'], payload['allowed_mentions']), ('@everyone', {'parse': ['everyone']}))
        payload = discord.build_payload(self.notification(name_sk='MGE'))
        self.assertEqual((payload['content'], payload['allowed_mentions']['parse']), ('<@&42>', []))

    def test_any_minutes_up_to_a_week_or_the_evening_before(self):
        event = KingdomEvent(name_sk='MGE', starts_at=NOW, reminders=[10, 5, EVENING_BEFORE, 7 * DAY])
        event.full_clean()
        for bad in ([7 * DAY + 1], [10, 10], [-1], [1, 2, 3, 4, 5, 6, 7]):
            event.reminders = bad
            with self.assertRaises(ValidationError):
                event.full_clean()

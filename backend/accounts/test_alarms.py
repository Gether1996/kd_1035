from datetime import timedelta
from unittest import mock

from django.test import TestCase, override_settings

from . import alarms, discord_bot
from .models import Alarm
from .test_reminders import BOT, ApiTestCase, make_player, utc

NOW = utc(2026, 10, 11, 12)


@mock.patch('django.utils.timezone.now', return_value=NOW)
class AlarmApiTests(ApiTestCase):
    def test_create_list_and_cancel(self, _now):
        res = self.send('post', '/api/me/alarms/', {'target': '2026-10-11T19:30:00Z', 'lead': 15, 'note': ' Štít '})
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(res.json()['note'], 'Štít')
        self.assertEqual(res.json()['remind_at'], '2026-10-11T19:15:00Z')
        listed = self.client.get('/api/me/alarms/').json()
        self.assertEqual([a['note'] for a in listed['alarms']], ['Štít'])
        self.assertEqual(listed['max'], 5)

        alarm_id = res.json()['id']
        self.assertEqual(self.send('delete', f'/api/me/alarms/{alarm_id}/').status_code, 204)
        self.assertFalse(Alarm.objects.exists())

    def test_rejects_past_too_far_and_over_the_limit(self, _now):
        for body, error in [
            ({'target': '2026-10-11T12:00:30Z'}, 'too_soon'),
            # the reminder itself would be in the past
            ({'target': '2026-10-11T12:30:00Z', 'lead': 60}, 'too_soon'),
            ({'target': '2026-10-25T12:01:00Z'}, 'too_far'),
        ]:
            with self.subTest(body):
                res = self.send('post', '/api/me/alarms/', body)
                self.assertEqual(res.status_code, 400)
                self.assertEqual(res.json()['target'], [error])
        for bad in [{'target': 'zajtra'}, {'target': '2026-10-11T19:30:00Z', 'lead': 1441}, {'target': '2026-10-11T19:30:00Z', 'note': 'x' * 101}]:
            with self.subTest(bad):
                self.assertEqual(self.send('post', '/api/me/alarms/', bad).status_code, 400)

        for _ in range(5):
            self.assertEqual(self.send('post', '/api/me/alarms/', {'target': '2026-10-12T10:00:00Z'}).status_code, 201)
        res = self.send('post', '/api/me/alarms/', {'target': '2026-10-12T10:00:00Z'})
        self.assertEqual((res.status_code, res.json()['detail']), (400, 'limit'))

    def test_only_own_waiting_alarms(self, _now):
        other = make_player('42')
        theirs = Alarm.objects.create(player=other, target_at=NOW + timedelta(hours=2), remind_at=NOW + timedelta(hours=2))
        sent = Alarm.objects.create(player=self.player, target_at=NOW, remind_at=NOW, sent_at=NOW, ok=True)
        self.assertEqual(self.client.get('/api/me/alarms/').json()['alarms'], [])
        self.assertEqual(self.send('delete', f'/api/me/alarms/{theirs.pk}/').status_code, 404)
        self.assertEqual(self.send('delete', f'/api/me/alarms/{sent.pk}/').status_code, 404)

    def test_needs_csrf_and_a_player(self, _now):
        self.assertEqual(self.send('post', '/api/me/alarms/', {'target': '2026-10-11T19:30:00Z'}, token=False).status_code, 403)
        self.client.logout()
        self.assertEqual(self.client.get('/api/me/alarms/').status_code, 403)


@override_settings(**BOT, SITE_URL='https://kd1035.eu')
class SendAlarmsTests(TestCase):
    def setUp(self):
        self.player = make_player()
        patcher = mock.patch('accounts.discord_bot.send_dm')
        self.dm = patcher.start()
        self.addCleanup(patcher.stop)

    def alarm(self, minutes, **kwargs):
        return Alarm.objects.create(
            player=self.player,
            note=kwargs.pop('note', 'Končí štít'),
            target_at=NOW + timedelta(minutes=minutes + 15),
            remind_at=NOW + timedelta(minutes=minutes),
            **kwargs,
        )

    def test_sends_once_when_due_and_closes_missed_ones(self):
        due = self.alarm(-2)
        later = self.alarm(5)
        missed = self.alarm(-30)
        self.assertEqual(alarms.send_alarms(NOW), 1)
        self.assertEqual(alarms.send_alarms(NOW), 0)
        self.assertEqual(self.dm.call_count, 1)
        discord_id, message = self.dm.call_args.args
        embed = message['embeds'][0]
        self.assertEqual((discord_id, embed['title']), (self.player.discord_id, 'Končí štít'))
        self.assertIn(f'<t:{int(due.target_at.timestamp())}:R>', embed['description'])
        self.assertIn('https://kd1035.eu/pripomienky#budiky', embed['description'])
        due.refresh_from_db(), later.refresh_from_db(), missed.refresh_from_db()
        self.assertTrue(due.ok)
        self.assertIsNone(later.sent_at)
        self.assertEqual((missed.ok, missed.error), (False, alarms.MISSED))

    def test_czech_title_without_text_and_bot_off_switch(self):
        self.player.lang = 'cs'
        self.player.save()
        self.alarm(-1, note='')
        alarms.send_alarms(NOW)
        embed = self.dm.call_args.args[1]['embeds'][0]
        self.assertEqual(embed['title'], 'Budík')
        self.assertIn('/cz/pripomienky#budiky', embed['description'])

        self.player.remind_discord = False
        self.player.save()
        self.alarm(-1)
        self.assertEqual(alarms.send_alarms(NOW), 0)

    def test_temporary_error_waits_blocked_is_logged(self):
        alarm = self.alarm(-1)
        self.dm.side_effect = discord_bot.BotError('429', temporary=True)
        with self.assertRaises(alarms.DiscordPaused):
            alarms.send_alarms(NOW)
        alarm.refresh_from_db()
        self.assertIsNone(alarm.sent_at)

        self.dm.side_effect = discord_bot.BotError(discord_bot.BLOCKED_MESSAGE, blocked=True)
        alarms.send_alarms(NOW)
        alarm.refresh_from_db()
        self.assertEqual((alarm.ok, alarm.error), (False, discord_bot.BLOCKED_MESSAGE))

    @override_settings(DISCORD_BOT_TOKEN='')
    def test_without_bot_nothing_happens(self):
        alarm = self.alarm(-1)
        self.assertEqual(alarms.send_alarms(NOW), 0)
        alarm.refresh_from_db()
        self.assertIsNone(alarm.sent_at)

    def test_prune_and_account_deletion(self):
        old = self.alarm(-2000, sent_at=NOW - timedelta(days=2), ok=True)
        fresh = self.alarm(-10, sent_at=NOW - timedelta(minutes=10), ok=True)
        waiting = self.alarm(60)
        self.assertEqual(alarms.prune_alarms(NOW), 1)
        self.assertEqual(set(Alarm.objects.values_list('pk', flat=True)), {fresh.pk, waiting.pk})
        self.assertFalse(Alarm.objects.filter(pk=old.pk).exists())
        self.player.delete_account()
        self.assertFalse(Alarm.objects.exists())

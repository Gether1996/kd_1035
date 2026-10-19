import json
from datetime import timedelta
from decimal import Decimal
from unittest import mock

from django.core.cache import cache
from django.db import connection
from django.test import Client, TestCase, override_settings
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from guides.models import CommanderFormation, CommanderPair

from . import discord_bot, notices
from .models import March, MarchNotice
from .reminders import DiscordPaused
from .test_reminders import make_player

BOT = {'DISCORD_BOT_TOKEN': 'token', 'SITE_URL': 'https://kd1035.eu'}


@override_settings(**BOT)
class RedMarches(TestCase):
    """Nelly with three red marches (and a rally march the evaluation skips), Bob with a right one, the superadmin"""

    def setUp(self):
        cache.clear()
        CommanderPair.objects.all().delete()
        CommanderPair.objects.create(primary='Attila', secondary='Takeda Shingen', points=100)
        CommanderFormation.objects.all().delete()
        CommanderFormation.objects.create(commander='Attila', formations=['arch', 'delta'])
        self.nelly = self.player('80351110224678912', 'Nelly')
        self.march(self.nelly, 1, 'Attila', '')  # solo
        self.march(self.nelly, 2, 'Takeda Shingen', 'Attila')  # the other order scores
        self.march(self.nelly, 3, 'Attila', 'Takeda Shingen', formation='wedge')  # a wrong formation
        self.march(self.nelly, 4, 'Attila', '', kind='conquering')  # rally is not evaluated
        self.bob = self.player('42', 'Bob')
        self.march(self.bob, 1, 'Attila', 'Takeda Shingen', formation='delta')  # all right
        admin = make_player('43')
        admin.user.is_superuser = True
        admin.user.save()
        self.admin = self.login(admin.user)

    def player(self, discord_id, ingame_name):
        player = make_player(discord_id)
        player.ingame_name = ingame_name
        player.save()
        return player

    def march(self, player, position, primary, secondary, kind='cavalry', formation=''):
        return March.objects.create(
            player=player, position=position, kind=kind, primary=primary, secondary=secondary, formation=formation
        )

    def login(self, user):
        client = Client(enforce_csrf_checks=True)
        client.force_login(user)
        client.token = client.get('/api/auth/me/').cookies['csrftoken'].value
        return client

    def post(self, data, client=None):
        client = client or self.admin
        return client.post(
            '/api/marches/notices/', json.dumps(data), content_type='application/json', HTTP_X_CSRFTOKEN=client.token
        )


class MarchNoticeTests(RedMarches):
    """Gether 14. 10. 2026: the superadmin tells players by a bot DM what is red in their marches."""

    def test_the_message_says_what_is_wrong_and_links_to_the_marches(self):
        problems = notices.problems_of(self.nelly, notices.march_checker())
        self.assertEqual([p['position'] for p in problems], [1, 2, 3])
        text = notices.message(self.nelly, problems)['embeds'][0]['description']
        self.assertIn('Ahoj Nelly', text)
        self.assertIn('**1. march** · jazda · Attila', text)
        self.assertIn('Chýba sekundárny commander', text)
        self.assertIn('prehoď commanderov: Attila + Takeda Shingen', text)
        self.assertIn('Formácia Wedge: Attila má viesť Arch alebo Delta', text)
        self.assertIn('(https://kd1035.eu/marche?tab=prehlad)', text)
        # never the points
        self.assertNotIn('100', text)
        # Czech for a Czech player; a pair with no other order to suggest
        self.nelly.lang = 'cs'
        CommanderPair.objects.all().delete()
        problems = notices.problems_of(self.nelly, notices.march_checker())
        text = notices.message(self.nelly, problems)['embeds'][0]['description']
        self.assertIn('Tento pár se ve vyhodnocování KvK nehodnotí', text)
        self.assertIn('/cz/marche?tab=prehlad', text)

    def test_the_fingerprint_follows_the_problem_itself(self):
        check = notices.march_checker()
        before = notices.fingerprint(notices.problems_of(self.nelly, check))
        March.objects.filter(player=self.nelly, position=2).update(primary='Achilles')
        self.assertNotEqual(notices.fingerprint(notices.problems_of(self.nelly, notices.march_checker())), before)

    def test_a_bonus_over_its_cap_is_told_whatever_the_type(self):
        """Gether 19. 10. 2026: ATK, DEF and HP over 14 %, All DMG over 8 % is a typo – red like a wrong pair."""
        before = notices.fingerprint(notices.problems_of(self.nelly, notices.march_checker()))
        # the caps themselves are fine
        March.objects.filter(player=self.bob).update(attack=14, defense=14, health=14, damage=8)
        self.assertEqual(notices.problems_of(self.bob, notices.march_checker()), [])
        March.objects.filter(player=self.bob).update(damage=Decimal('24'))
        # the rally march gets no pair warning, but a bonus over its cap all the same
        March.objects.filter(player=self.nelly, position=4).update(health=Decimal('14.1'), attack=Decimal('20'))
        check = notices.march_checker()
        bob = notices.problems_of(self.bob, check)
        self.assertEqual([(p['position'], p['pair_problem'], p['stats_problem']) for p in bob], [(1, None, ['damage'])])
        text = notices.message(self.bob, bob)['embeds'][0]['description']
        self.assertIn('Bonusy armamentov nad maximum: All DMG 24 % (max 8 %).', text)
        nelly = notices.problems_of(self.nelly, check)
        self.assertEqual([p['stats_problem'] for p in nelly], [None, None, None, ['attack', 'health']])
        self.nelly.lang = 'cs'
        lines = notices.lines(self.nelly, nelly, markdown=False)
        self.assertIn('• Bonusy armamentů nad maximum: ATK 20 % (max 14 %), HP 14,1 % (max 14 %). Zkontroluj je ve hře a oprav.', lines)
        # marches without such a bonus keep the fingerprint they had before the caps (no message told twice)
        self.assertEqual(notices.fingerprint(nelly[:3]), before)

    def test_superuser_only(self):
        other = self.login(self.bob.user)
        self.assertEqual(other.get('/api/marches/notices/').status_code, 403)
        self.assertEqual(self.post({'players': [self.nelly.pk]}, other).status_code, 403)
        self.assertEqual(Client().get('/api/marches/notices/').status_code, 403)

    def test_preview_queue_and_send(self):
        data = self.admin.get('/api/marches/notices/').json()
        self.assertTrue(data['bot'])
        self.assertEqual([p['ingame_name'] for p in data['players']], ['Nelly'])
        row = data['players'][0]
        self.assertEqual((row['marches'], row['muted'], row['told_at'], row['last']), (3, False, None, None))
        self.assertIn('Formácia Wedge', row['text'])
        for bad in ({}, {'players': []}, {'players': ['1']}, {'players': [True]}):
            self.assertEqual(self.post(bad).status_code, 400, bad)
        # Bob has nothing red: not queued; Nelly once, a double click queues nothing more
        self.assertEqual(self.post({'players': [self.nelly.pk, self.bob.pk]}).json(), {'queued': 1})
        self.assertEqual(self.post({'players': [self.nelly.pk]}).json(), {'queued': 0})
        self.assertEqual(self.admin.get('/api/marches/notices/').json()['players'][0]['last']['state'], 'pending')

        with mock.patch.object(discord_bot, 'send_dm') as send:
            self.assertEqual(notices.send_march_notices(), 1)
        target, message = send.call_args.args
        self.assertEqual(target, self.nelly.discord_id)
        self.assertEqual(message['embeds'][0]['title'], 'Skontroluj svoje marche')
        row = self.admin.get('/api/marches/notices/').json()['players'][0]
        self.assertEqual(row['last']['state'], 'sent')
        self.assertIsNotNone(row['told_at'])
        # sent once only
        with mock.patch.object(discord_bot, 'send_dm') as send:
            self.assertEqual(notices.send_march_notices(), 0)
        send.assert_not_called()

    def test_fixed_meanwhile_or_muted_is_not_sent(self):
        self.post({'players': [self.nelly.pk]})
        March.objects.filter(player=self.nelly, kind='cavalry').update(secondary='Takeda Shingen', primary='Attila', formation='')
        with mock.patch.object(discord_bot, 'send_dm') as send:
            notices.send_march_notices()
        send.assert_not_called()
        self.assertEqual(MarchNotice.objects.get().state, 'skipped')
        # the bot's messages switched off: not offered to queue
        self.nelly.remind_discord = False
        self.nelly.save()
        March.objects.filter(player=self.nelly, position=1).update(secondary='')
        self.assertTrue(self.admin.get('/api/marches/notices/').json()['players'][0]['muted'])
        self.assertEqual(self.post({'players': [self.nelly.pk]}).json(), {'queued': 0})

    def test_blocked_dms_fail_discord_down_waits(self):
        self.post({'players': [self.nelly.pk]})
        down = discord_bot.BotError('429', temporary=True)
        with mock.patch.object(discord_bot, 'send_dm', side_effect=down), self.assertRaises(DiscordPaused):
            notices.send_march_notices()
        notice = MarchNotice.objects.get()
        self.assertEqual((notice.state, notice.claimed_at), ('pending', None))
        blocked = discord_bot.BotError('closed', blocked=True)
        with mock.patch.object(discord_bot, 'send_dm', side_effect=blocked):
            notices.send_march_notices()
        notice.refresh_from_db()
        self.assertEqual(notice.state, 'failed')
        self.assertIn('súkromné správy', notice.error)
        self.assertEqual(self.admin.get('/api/marches/notices/').json()['players'][0]['last']['state'], 'failed')

    def test_stuck_and_old_rows(self):
        now = timezone.now()
        stuck = MarchNotice.objects.create(player=self.nelly, fingerprint='x', claimed_at=now - timedelta(minutes=11))
        old = MarchNotice.objects.create(player=self.nelly, fingerprint='y', state='sent')
        MarchNotice.objects.filter(pk=old.pk).update(created_at=now - timedelta(days=31))
        with mock.patch.object(discord_bot, 'send_dm'):
            notices.send_march_notices(now)
        stuck.refresh_from_db()
        self.assertEqual(stuck.state, 'failed')
        self.assertFalse(MarchNotice.objects.filter(pk=old.pk).exists())

    @override_settings(DISCORD_BOT_TOKEN='')
    def test_without_the_bot(self):
        self.assertFalse(self.admin.get('/api/marches/notices/').json()['bot'])
        self.assertEqual(self.post({'players': [self.nelly.pk]}).json(), {'detail': 'bot'})

    def test_gone_with_the_account(self):
        self.post({'players': [self.nelly.pk]})
        self.nelly.delete_account()
        self.assertFalse(MarchNotice.objects.exists())


class ReviewerIssuesTests(RedMarches):
    """The Hráči list on /ucet counts the red marches of each player (`issues`) in the same number of queries for any
    number of players."""

    def rows(self):
        return {p['id']: p for p in self.admin.get('/api/kvk/reviewers/').json()['players']}

    def test_issues_are_the_red_marches(self):
        rows = self.rows()
        # solo, the other order and a wrong formation; the rally march is not evaluated
        self.assertEqual((rows[self.nelly.pk]['issues'], rows[self.nelly.pk]['marches']), (3, 4))
        self.assertEqual((rows[self.bob.pk]['issues'], rows[self.bob.pk]['marches']), (0, 1))
        March.objects.filter(player=self.nelly, position=1).update(secondary='Takeda Shingen')
        self.assertEqual(self.rows()[self.nelly.pk]['issues'], 2)
        # an armament bonus over its cap (Gether 19. 10. 2026) – also on the rally march
        March.objects.filter(player=self.nelly, position=4).update(damage=Decimal('8.1'))
        March.objects.filter(player=self.bob).update(defense=Decimal('15'))
        rows = self.rows()
        self.assertEqual((rows[self.nelly.pk]['issues'], rows[self.bob.pk]['issues']), (3, 1))

    def test_the_queries_do_not_grow_with_the_players(self):
        self.bob.delete_account()
        self.rows()  # the first request of the session writes it
        with CaptureQueriesContext(connection) as one:
            self.assertEqual(self.rows()[self.nelly.pk]['issues'], 3)
        for n in range(4):
            other = self.player(str(900 + n), f'Other {n}')
            self.march(other, 1, 'Attila', '')  # solo
            self.march(other, 2, 'Attila', 'Takeda Shingen', formation='wedge')
        with self.assertNumQueries(len(one.captured_queries)):
            rows = self.rows()
        self.assertEqual(sorted(p['issues'] for p in rows.values()), [0, 2, 2, 2, 2, 3])

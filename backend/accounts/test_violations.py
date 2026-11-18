"""Strikes for rule violations on /priestupky (Gether 18. 11. 2026)."""

import json
from datetime import date
from importlib import import_module
from unittest import mock

from django.apps import apps
from django.core.cache import cache
from django.test import TestCase

from . import violations
from .models import Violation, ViolationSettings, default_violation_levels
from .test_reminders import make_player

TODAY = date(2026, 11, 18)


@mock.patch('django.utils.timezone.localdate', return_value=TODAY)
class ViolationTests(TestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        self.nelly = make_player('1')
        self.nelly.ingame_name = 'Nelly'
        self.nelly.save()
        self.bob = make_player('2')
        self.bob.ingame_name = 'Bob'
        self.bob.save()
        self.manager = make_player('3')
        self.manager.violations_manager = True
        self.manager.ingame_name = 'Methiu'
        self.manager.save()
        self.client.force_login(self.manager.user)
        # Gether: "prvý priestupok 1 týždeň kick z Ali, druhý kumulatívny 2 týždne, tretí zero … resetuje za X času"
        ViolationSettings.objects.update_or_create(
            pk=1, defaults={'reset_days': 30, 'levels': default_violation_levels(), 'description': 'Pravidlá'}
        )

    def post(self, data):
        return self.client.post('/api/violations/', json.dumps(data), content_type='application/json')

    def card(self, day, player=None):
        return Violation.objects.create(player=player or self.nelly, day=day, reason='MGE')

    def row(self, player=None):
        rows = self.client.get('/api/violations/').json()['players']
        return next(r for r in rows if r['id'] == (player or self.nelly).pk)

    def test_the_next_strike_until_the_penalty_ended_and_reset_days_passed(self, _today):
        self.card(date(2026, 3, 1))  # 1st: kick until 8. 3., the next strike until 7. 4.
        self.card(date(2026, 4, 7))  # 2nd: kick until 21. 4., the next strike until 21. 5.
        self.card(date(2026, 6, 1))  # later – the 1st again
        # a new run: 1st, 2nd, 3rd (zero), and past the last strike the last one again
        self.card(date(2026, 10, 1))
        self.card(date(2026, 10, 20))
        self.card(date(2026, 11, 1))
        self.card(date(2026, 11, 15))
        row = self.row()
        self.assertEqual([c['level'] for c in row['cards']], [4, 3, 2, 1, 1, 2, 1])
        # the zero has no time: no penalty running, the strike stays until 30 days after its day
        self.assertEqual((row['level'], row['penalty_until'], row['reset_on']), (4, None, '2026-12-16'))

    def test_a_penalty_still_running_from_an_earlier_strike(self, _today):
        """a zero (no time) during a 2-week kick: the kick keeps running, the reset counts from its end"""
        self.card(date(2026, 10, 25))  # 1st
        self.card(date(2026, 11, 10))  # 2nd: kick until 24. 11.
        self.card(date(2026, 11, 15))  # 3rd: zero
        row = self.row()
        self.assertEqual(
            (row['level'], row['penalty_until'], row['penalty'], row['reset_on']), (3, '2026-11-24', 'Kick z aliancie', '2026-12-25')
        )

    def test_a_running_penalty_and_clean_again_after_the_reset(self, _today):
        self.card(date(2026, 11, 17), self.bob)
        bob = self.row(self.bob)
        self.assertEqual((bob['level'], bob['penalty_until'], bob['reset_on']), (1, '2026-11-24', '2026-12-25'))
        # 8. 10.: the kick ended 15. 10., clean since 15. 11.
        self.card(date(2026, 10, 8))
        self.assertEqual(self.row()['level'], 0)
        rules = ViolationSettings.load()
        rules.reset_days = 60
        rules.save()
        self.assertEqual(self.row()['level'], 1)

    def test_add_and_delete(self, _today):
        added = self.post({'player': self.nelly.pk, 'day': '2026-11-17', 'reason': '  Prestrelil MGE  '})
        self.assertEqual(added.status_code, 201)
        card = added.json()['cards'][0]
        self.assertEqual((card['reason'], card['level'], card['added_by']), ('Prestrelil MGE', 1, 'Methiu'))
        second = self.post({'player': self.nelly.pk, 'day': '2026-11-18', 'reason': 'Ark'}).json()
        self.assertEqual((second['level'], second['penalty_until']), (2, '2026-12-02'))
        gone = self.client.delete(f'/api/violations/{second["cards"][0]["id"]}/')
        self.assertEqual(gone.json()['level'], 1)
        # not in the future, not for an unknown or unapproved player, a reason is needed
        self.assertEqual(self.post({'player': self.nelly.pk, 'day': '2026-11-19', 'reason': 'x'}).status_code, 400)
        waiting = make_player('9', approved=False)
        self.assertEqual(self.post({'player': waiting.pk, 'day': '2026-11-18', 'reason': 'x'}).status_code, 400)
        self.assertEqual(self.post({'player': self.nelly.pk, 'day': '2026-11-18', 'reason': ' '}).status_code, 400)

    def test_the_board_every_approved_player_sees_no_reasons(self, _today):
        """Gether: "druhý tab, ktorý budú vidieť všetci, kde už bude zverejnená tabuľa ľudí s priestupkami a ich timerom" """
        self.card(date(2026, 11, 1))  # Nelly: the kick ended 8. 11. – still on the board until the reset
        self.card(date(2026, 11, 17), self.bob)  # Bob: the kick runs
        self.card(date(2026, 6, 1), self.manager)  # long clean
        self.client.force_login(self.nelly.user)
        self.assertEqual(self.client.get('/api/violations/').status_code, 403)
        board = self.client.get('/api/violations/board/').json()
        self.assertEqual((board['description'], board['reset_days'], board['manage']), ('Pravidlá', 30, False))
        self.assertEqual(
            [(p['name'], p['level'], p['penalty_until'], p['reset_on']) for p in board['players']],
            [('Bob', 1, '2026-11-24', '2026-12-25'), ('Nelly', 1, None, '2026-12-09')],
        )
        self.assertNotIn('MGE', json.dumps(board))
        # not for a fresh account waiting for approval or a visitor
        self.client.force_login(make_player('9', approved=False).user)
        self.assertEqual(self.client.get('/api/violations/board/').status_code, 403)
        self.client.logout()
        self.assertEqual(self.client.get('/api/violations/board/').status_code, 403)

    def test_only_the_superadmin_and_players_with_the_switch_manage(self, _today):
        self.client.force_login(self.bob.user)
        self.assertEqual(self.client.get('/api/violations/').status_code, 403)
        self.assertEqual(self.post({'player': self.nelly.pk, 'day': '2026-11-18', 'reason': 'x'}).status_code, 403)
        # a taken-back approval cuts the switch off
        self.manager.approved = False
        self.manager.save()
        self.client.force_login(self.manager.user)
        self.assertEqual(self.client.get('/api/violations/').status_code, 403)

    def test_the_rules_and_the_description_only_by_the_superadmin(self, _today):
        rules = {
            'reset_days': 45,
            'keep_days': 400,
            'description': 'Prvý strike – týždeň kick.',
            'levels': [{'name': 'Strike', 'penalty': '', 'days': 7}],
        }
        put = lambda: self.client.put('/api/violations/settings/', json.dumps(rules), content_type='application/json')
        self.assertEqual(put().status_code, 403)
        self.assertFalse(self.client.get('/api/violations/').json()['edit_rules'])
        self.manager.user.is_superuser = True
        self.manager.user.save()
        self.assertEqual(put().json(), rules)
        self.assertEqual(ViolationSettings.load().description, 'Prvý strike – týždeň kick.')
        rules['levels'] = []
        self.assertEqual(put().status_code, 400)

    def test_old_violations_are_deleted_after_keep_days(self, _today):
        self.card(date(2025, 11, 17))
        kept = self.card(date(2025, 11, 18))
        self.assertEqual(violations.prune(TODAY), 1)
        self.assertEqual(list(Violation.objects.all()), [kept])

    def test_the_switch_in_me(self, _today):
        self.assertTrue(self.client.get('/api/auth/me/').json()['user']['violations'])
        self.client.force_login(self.nelly.user)
        self.assertFalse(self.client.get('/api/auth/me/').json()['user']['violations'])


class StrikesMigrationTests(TestCase):
    def test_the_first_default_rules_become_the_strikes_changed_ones_stay(self):
        strikes = import_module('accounts.migrations.0068_violation_strikes')
        rules = ViolationSettings.load()
        rules.levels = strikes.OLD_LEVELS
        rules.save()
        strikes.strikes(apps, None)
        self.assertEqual(ViolationSettings.load().levels, default_violation_levels())
        changed = [{'name': 'Vlastný', 'penalty': '', 'days': 3}]
        ViolationSettings.objects.filter(pk=1).update(levels=changed)
        strikes.strikes(apps, None)
        self.assertEqual(ViolationSettings.load().levels, changed)

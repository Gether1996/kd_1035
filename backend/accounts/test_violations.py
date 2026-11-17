"""Yellow cards for rule violations on /priestupky (Gether 18. 11. 2026)."""

import json
from datetime import date
from unittest import mock

from django.core.cache import cache
from django.test import TestCase

from . import violations
from .models import Violation, ViolationSettings
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
        self.manager = make_player('3')
        self.manager.violations_manager = True
        self.manager.ingame_name = 'Methiu'
        self.manager.save()
        self.client.force_login(self.manager.user)
        ViolationSettings.objects.update_or_create(
            pk=1,
            defaults={
                'window_days': 60,
                'levels': [
                    {'name': 'Žltá', 'penalty': 'Varovanie', 'days': 0},
                    {'name': '2. žltá', 'penalty': 'Bez MGE', 'days': 14},
                    {'name': 'Červená', 'penalty': 'Bez eventov', 'days': 30},
                ],
            },
        )

    def post(self, data, client=None):
        return (client or self.client).post('/api/violations/', json.dumps(data), content_type='application/json')

    def card(self, day, player=None):
        return Violation.objects.create(player=player or self.nelly, day=day, reason='MGE')

    def row(self, player=None):
        rows = self.client.get('/api/violations/').json()['players']
        return next(r for r in rows if r['id'] == (player or self.nelly).pk)

    def test_a_card_within_the_window_goes_a_level_up_a_longer_gap_starts_again(self, _today):
        """Gether: "pokiaľ pridáš ďalšiu do tohto času, zvýši sa mu trest, ak po čase, tak znova reset" """
        self.card(date(2026, 3, 1))
        # 92 days later – over the 60 days: the first level again
        self.card(date(2026, 6, 1))
        self.card(date(2026, 7, 20))
        self.card(date(2026, 9, 10))
        # past the last level: the last one again
        self.card(date(2026, 11, 1))
        row = self.row()
        self.assertEqual([c['level'] for c in row['cards']], [4, 3, 2, 1, 1])
        self.assertEqual([c['day'] for c in row['cards']][0], '2026-11-01')
        self.assertEqual((row['level'], row['active_until']), (4, '2026-12-31'))
        # the red card's 30 days
        self.assertEqual(row['penalty_until'], '2026-12-01')

    def test_clean_again_after_the_window_and_the_rules_apply_at_once(self, _today):
        self.card(date(2026, 8, 1))
        row = self.row()
        self.assertEqual((row['level'], row['active_until'], row['penalty_until']), (0, None, None))
        rules = ViolationSettings.load()
        rules.window_days = 120
        rules.save()
        self.assertEqual(self.row()['level'], 1)

    def test_add_and_delete_a_card(self, _today):
        added = self.post({'player': self.nelly.pk, 'day': '2026-11-17', 'reason': '  Prestrelil MGE  '})
        self.assertEqual(added.status_code, 201)
        card = added.json()['cards'][0]
        self.assertEqual((card['reason'], card['level'], card['added_by']), ('Prestrelil MGE', 1, 'Methiu'))
        self.assertEqual(added.json()['level'], 1)
        second = self.post({'player': self.nelly.pk, 'day': '2026-11-18', 'reason': 'Ark'}).json()
        self.assertEqual((second['level'], second['penalty_until']), (2, '2026-12-02'))
        gone = self.client.delete(f'/api/violations/{second["cards"][0]["id"]}/')
        self.assertEqual(gone.json()['level'], 1)
        # no card in the future, no card for an unknown or unapproved player, a reason is needed
        self.assertEqual(self.post({'player': self.nelly.pk, 'day': '2026-11-19', 'reason': 'x'}).status_code, 400)
        waiting = make_player('9', approved=False)
        self.assertEqual(self.post({'player': waiting.pk, 'day': '2026-11-18', 'reason': 'x'}).status_code, 400)
        self.assertEqual(self.post({'player': self.nelly.pk, 'day': '2026-11-18', 'reason': ' '}).status_code, 400)

    def test_only_the_superadmin_and_players_with_the_switch(self, _today):
        self.client.force_login(self.bob.user)
        self.assertEqual(self.client.get('/api/violations/').status_code, 403)
        self.assertEqual(self.post({'player': self.nelly.pk, 'day': '2026-11-18', 'reason': 'x'}).status_code, 403)
        # a taken-back approval cuts the switch off
        self.manager.approved = False
        self.manager.save()
        self.client.force_login(self.manager.user)
        self.assertEqual(self.client.get('/api/violations/').status_code, 403)
        self.client.logout()
        self.assertEqual(self.client.get('/api/violations/').status_code, 403)

    def test_the_rules_only_by_the_superadmin(self, _today):
        rules = {'window_days': 180, 'keep_days': 400, 'levels': [{'name': 'Karta', 'penalty': '', 'days': 7}]}
        put = lambda: self.client.put('/api/violations/settings/', json.dumps(rules), content_type='application/json')
        self.assertEqual(put().status_code, 403)
        self.assertFalse(self.client.get('/api/violations/').json()['edit_rules'])
        self.manager.user.is_superuser = True
        self.manager.user.save()
        self.assertEqual(put().json(), rules)
        self.assertEqual(ViolationSettings.load().window_days, 180)
        rules['levels'] = []
        self.assertEqual(put().status_code, 400)

    def test_old_cards_are_deleted_after_keep_days(self, _today):
        self.card(date(2025, 11, 17))
        kept = self.card(date(2025, 11, 18))
        self.assertEqual(violations.prune(TODAY), 1)
        self.assertEqual(list(Violation.objects.all()), [kept])

    def test_the_switch_on_the_players_list_and_in_me(self, _today):
        self.assertTrue(self.client.get('/api/auth/me/').json()['user']['violations'])
        self.client.force_login(self.nelly.user)
        self.assertFalse(self.client.get('/api/auth/me/').json()['user']['violations'])

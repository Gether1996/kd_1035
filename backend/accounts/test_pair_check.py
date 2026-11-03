from io import StringIO
from types import SimpleNamespace

from django.core.management import call_command
from django.test import SimpleTestCase, TestCase

from guides import armory

from .models import KvkSignup, March
from .pair_check import march_checker, rare_excess
from .test_reminders import make_player

# two gold of one armament exist only in the formations with two sets (Delta, Pincer, Wedge)
TWO_GOLD_EMBLEM = ['delta-emblem-flurry', 'delta-ii-emblem-raging-tide']
GOLD_BLUE_FLAG = ['arch-flag-invincible', 'arch-flag-unswerving']


def army(inscriptions):
    return SimpleNamespace(inscriptions=inscriptions)


class RareExcessTests(SimpleTestCase):
    """Builds saved before v1.56.6 allowed one gold or blue inscription per armament (Gether 3. 11. 2026)."""

    def test_more_than_one_gold_or_blue_on_an_armament(self):
        self.assertEqual(rare_excess(army(TWO_GOLD_EMBLEM)), ['emblem'])
        self.assertEqual(rare_excess(army(GOLD_BLUE_FLAG)), ['flag'])
        # in the game's order, whatever the order clicked
        self.assertEqual(rare_excess(army([*GOLD_BLUE_FLAG, *TWO_GOLD_EMBLEM])), ['emblem', 'flag'])

    def test_one_gold_or_blue_with_white_is_fine(self):
        self.assertIsNone(rare_excess(army(['arch-flag-invincible', 'u-flag-assertive'])))
        self.assertIsNone(rare_excess(army(['arch-flag-unswerving', 'u-flag-assertive'])))
        self.assertIsNone(rare_excess(army(['u-flag-assertive', 'u-flag-ballistics'])))
        # gold on two different armaments
        self.assertIsNone(rare_excess(army(['arch-flag-invincible', 'arch-emblem-fearless'])))

    def test_unknown_ids_and_broken_values_are_skipped(self):
        self.assertIsNone(rare_excess(army(['gone', 'gone-too', 'arch-flag-invincible'])))
        self.assertIsNone(rare_excess(army(None)))
        self.assertIsNone(rare_excess(army({'a': 1})))
        self.assertIsNone(rare_excess(army([1, None, 'arch-flag-invincible'])))
        self.assertEqual(armory.rare_excess(['gone', *TWO_GOLD_EMBLEM]), ['emblem'])


class CheckerTests(TestCase):
    def test_any_type_gets_it(self):
        player = make_player('80351110224678912')
        march = March.objects.create(player=player, position=1, kind='conquering', primary='', inscriptions=TWO_GOLD_EMBLEM)
        self.assertEqual(march_checker()(march)['inscription_problem'], ['emblem'])
        march.inscriptions = ['arch-flag-invincible', 'u-flag-assertive']
        self.assertIsNone(march_checker()(march)['inscription_problem'])

    def test_count_rare_excess_prints_counts_only(self):
        nelly, bob = make_player('80351110224678912'), make_player('42')
        nelly.ingame_name = 'Nelly'
        nelly.save()
        March.objects.create(player=nelly, position=1, kind='cavalry', primary='Attila', inscriptions=TWO_GOLD_EMBLEM)
        March.objects.create(player=nelly, position=2, kind='cavalry', primary='Attila', inscriptions=GOLD_BLUE_FLAG)
        March.objects.create(player=bob, position=1, kind='cavalry', primary='Attila', inscriptions=['u-flag-assertive'])
        KvkSignup.objects.create(player=bob, role='rally', kind='cavalry', primary='Attila', inscriptions=GOLD_BLUE_FLAG)
        out = StringIO()
        with self.assertNumQueries(2):
            call_command('count_rare_excess', stdout=out)
        self.assertEqual(out.getvalue(), 'marches: 2 (players: 1)\nsign-ups: 1 (players: 1)\n')
        self.assertNotIn('Nelly', out.getvalue())

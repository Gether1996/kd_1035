import json
from importlib import import_module

from django.apps import apps as django_apps
from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import Client, TestCase, override_settings

from guides import commander_index
from guides.meta.sync import sync_guides
from guides.models import CommanderPair, fold
from guides.roster import commander_names

from .models import EvaluationSettings, March, PlayerEvaluation
from .test_reminders import PLAIN_STATIC, make_player


class EvaluationApiTests(TestCase):
    """/vyhodnocovanie (Gether 13. 10. 2026): the variables and the superadmin's notes about players, superuser only."""

    def setUp(self):
        cache.clear()
        self.player = make_player()
        self.newbie = make_player('42', approved=False)
        March.objects.create(player=self.player, position=1, kind='cavalry', primary='Attila', secondary='Achilles')
        admin = make_player('245662824171438090')
        admin.user.is_superuser = True
        admin.user.save()
        self.admin = self.login(admin.user)
        self.nelly = self.login(self.player.user)

    def login(self, user):
        client = Client(enforce_csrf_checks=True)
        client.force_login(user)
        client.token = client.get('/api/auth/me/').cookies['csrftoken'].value
        return client

    def call(self, method, url, data, client=None):
        client = client or self.admin
        return getattr(client, method)(url, data, content_type='application/json', HTTP_X_CSRFTOKEN=client.token)

    def test_only_the_superuser(self):
        self.assertEqual(Client().get('/api/evaluation/').status_code, 403)
        self.assertEqual(self.nelly.get('/api/evaluation/').status_code, 403)
        self.assertEqual(self.call('put', '/api/evaluation/settings/', {'settings': {}}, self.nelly).status_code, 403)
        url = f'/api/evaluation/players/{self.player.pk}/'
        self.assertEqual(self.call('patch', url, {'t4': True}, self.nelly).status_code, 403)

    def test_lists_every_player_with_marches_and_notes(self):
        data = self.admin.get('/api/evaluation/').json()
        # nothing saved: the page uses its defaults
        self.assertEqual((data['settings'], data['updated_at']), (None, None))
        rows = {p['id']: p for p in data['players']}
        row = rows[self.player.pk]
        self.assertEqual([m['primary'] for m in row['marches']], ['Attila'])
        self.assertEqual(row['marches'][0]['primary_skills'], '5555')
        self.assertEqual((row['power'], row['t4'], row['power_bonus']), (None, False, 0.0))
        # the acclaim reached is not written down any more (Gether 14. 10. 2026)
        self.assertNotIn('acclaim', row)
        # the one waiting for the approval too, marked
        self.assertFalse(rows[self.newbie.pk]['approved'])

    def test_saves_the_variables(self):
        value = {'acclaim': {'benchmark': 5600000, 'score': 286.5}, 'pairs': [['Attila', 'Achilles', 92]], 'on': True}
        res = self.call('put', '/api/evaluation/settings/', {'settings': value})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['settings'], value)
        self.assertEqual(EvaluationSettings.load().data, value)
        self.assertEqual(self.admin.get('/api/evaluation/').json()['settings'], value)
        # plain JSON objects only, of a sane size and depth
        for bad in ([1, 2], 'x', {'a': {'b': {'c': {'d': {'e': {'f': {'g': {}}}}}}}}, {'t': 'x' * 300}):
            self.assertEqual(self.call('put', '/api/evaluation/settings/', {'settings': bad}).status_code, 400, bad)
        big = {'pairs': [['Commander number %d' % i, 'Other', 50] for i in range(3000)]}
        self.assertEqual(self.call('put', '/api/evaluation/settings/', {'settings': big}).json(), {'settings': 'too_large'})
        # back to the defaults
        self.assertEqual(self.call('put', '/api/evaluation/settings/', {'settings': None}).json()['settings'], None)

    def test_notes_about_a_player(self):
        url = f'/api/evaluation/players/{self.player.pk}/'
        res = self.call('patch', url, {'power': 101.5, 'acclaim': 5600000})
        self.assertEqual(res.json(), {'id': self.player.pk, 'power': 101.5, 't4': False, 'power_bonus': 0.0})
        self.assertIsNone(PlayerEvaluation.objects.get(player=self.player).acclaim)
        res = self.call('patch', url, {'t4': True, 'power_bonus': -6})
        self.assertEqual((res.json()['power'], res.json()['t4'], res.json()['power_bonus']), (101.5, True, -6.0))
        self.assertEqual(self.call('patch', url, {'power': None}).json()['power'], None)
        for bad in ({}, {'power': -1}, {'power': 'x'}, {'power': 1.25}, {'acclaim': 5}, {'t4': 'yes'}, {'power_bonus': 5000}):
            self.assertEqual(self.call('patch', url, bad).status_code, 400, bad)
        self.assertEqual(self.call('patch', '/api/evaluation/players/999999/', {'t4': True}).status_code, 404)
        # the notes go with the account
        self.player.delete_account()
        self.assertFalse(PlayerEvaluation.objects.exists())

    def test_many_players_at_once(self):
        url = '/api/evaluation/players/'
        res = self.call('patch', url, {'players': [{'id': self.player.pk, 'power': 101.5}, {'id': self.newbie.pk, 'power': 64}]})
        self.assertEqual([(p['id'], p['power']) for p in res.json()['players']], [(self.player.pk, 101.5), (self.newbie.pk, 64.0)])
        self.assertEqual(PlayerEvaluation.objects.get(player=self.newbie).power, 64)
        # all or nothing
        res = self.call('patch', url, {'players': [{'id': self.player.pk, 'power': 50}, {'id': 999999, 'power': 1}]})
        self.assertEqual(res.status_code, 400)
        self.assertEqual(PlayerEvaluation.objects.get(player=self.player).power, 101.5)
        for bad in ({}, {'players': []}, {'players': [{'power': 1}]}, {'players': [{'id': self.player.pk, 'power': -1}]}):
            self.assertEqual(self.call('patch', url, bad).status_code, 400, bad)
        self.assertEqual(self.call('patch', url, {'players': [{'id': self.player.pk, 'power': 1}]}, self.nelly).status_code, 403)

    def test_the_superuser_lets_players_in(self):
        # the switch next to R4 in Hráči on /ucet – one for the estimate and the variables (Gether 14. 10. 2026)
        url = f'/api/kvk/reviewers/{self.player.pk}/'
        self.assertEqual(self.call('patch', url, {'evaluation_settings': 'yes'}).status_code, 400)
        self.assertEqual(self.call('patch', url, {'evaluation_settings': True}, self.nelly).status_code, 403)
        # the old table switch is gone
        self.assertEqual(self.call('patch', url, {'evaluator': True}).status_code, 400)
        self.assertEqual(self.nelly.get('/api/auth/me/').json()['user']['evaluation_settings'], False)
        res = self.call('patch', url, {'evaluation_settings': True})
        self.assertEqual(
            res.json(),
            {'id': self.player.pk, 'reviewer': False, 'approved': True, 'evaluation_settings': True, 'evaluation_overview': False},
        )
        rows = {p['id']: p for p in self.admin.get('/api/kvk/reviewers/').json()['players']}
        self.assertTrue(rows[self.player.pk]['evaluation_settings'])
        me = self.nelly.get('/api/auth/me/').json()['user']
        # the evaluators see the published overview too
        self.assertEqual((me['evaluation_settings'], me['evaluation_overview']), (True, True))
        # the page, the variables and the notes – of approved players only
        data = self.nelly.get('/api/evaluation/')
        self.assertEqual(data.status_code, 200)
        ids = {p['id'] for p in data.json()['players']}
        self.assertIn(self.player.pk, ids)
        self.assertNotIn(self.newbie.pk, ids)
        self.assertEqual(self.call('put', '/api/evaluation/settings/', {'settings': {'a': 1}}, self.nelly).status_code, 200)
        self.assertEqual(self.call('patch', f'/api/evaluation/players/{self.player.pk}/', {'power': 90}, self.nelly).status_code, 200)
        self.assertEqual(self.call('patch', f'/api/evaluation/players/{self.newbie.pk}/', {'power': 90}, self.nelly).status_code, 404)
        bulk = {'players': [{'id': self.newbie.pk, 'power': 1}]}
        self.assertEqual(self.call('patch', '/api/evaluation/players/', bulk, self.nelly).status_code, 400)
        # the overview only: nothing of the evaluation itself
        self.call('patch', url, {'evaluation_settings': False, 'evaluation_overview': True})
        me = self.nelly.get('/api/auth/me/').json()['user']
        self.assertEqual((me['evaluation_settings'], me['evaluation_overview']), (False, True))
        self.assertEqual(self.nelly.get('/api/evaluation/').status_code, 403)
        self.assertEqual(self.nelly.get('/api/evaluation/overview/').status_code, 200)
        self.assertEqual(self.call('put', '/api/evaluation/settings/', {'settings': {'a': 2}}, self.nelly).status_code, 403)
        self.assertEqual(self.call('patch', f'/api/evaluation/players/{self.player.pk}/', {'power': 80}, self.nelly).status_code, 403)
        self.assertEqual(self.call('put', '/api/evaluation/overview/', {'rows': []}, self.nelly).status_code, 403)
        # both off again: no way in
        self.call('patch', url, {'evaluation_overview': False})
        self.assertEqual(self.nelly.get('/api/evaluation/').status_code, 403)
        self.assertEqual(self.nelly.get('/api/evaluation/overview/').status_code, 403)
        # the superuser counts as both
        me = self.admin.get('/api/auth/me/').json()['user']
        self.assertEqual((me['evaluation_settings'], me['evaluation_overview']), (True, True))

    def test_the_required_acclaim_is_published_for_the_players(self):
        """Gether 14. 10. 2026: "Požadovaný acclaim" – a plain overview for the players, nothing to edit"""
        url = '/api/evaluation/overview/'
        self.assertEqual(Client().get(url).status_code, 403)
        self.assertEqual(self.admin.get(url).json(), {'published_at': None, 'rows': []})
        self.assertEqual(self.admin.get('/api/evaluation/').json()['overview'], {'published_at': None, 'rows': []})
        self.player.ingame_name = 'Nelly v hre'
        self.player.save()
        row = {'id': self.player.pk, 'marches': 3, 'missing': 1, 'required': 1_250_000}
        res = self.call('put', url, {'rows': [row]})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['rows'], [row])
        self.assertIsNotNone(res.json()['published_at'])
        # the evaluators see what was published next to the estimate
        self.assertEqual(self.admin.get('/api/evaluation/').json()['overview']['rows'], [row])
        # the players with the switch: the name in the game, the avatar and the numbers – no power, no marches
        self.player.evaluation_overview = True
        self.player.save()
        data = self.nelly.get(url).json()
        self.assertEqual(
            data['rows'],
            [{**row, 'name': 'Nelly v hre', 'avatar_url': self.player.avatar_url, 'you': True}],
        )
        self.assertFalse(self.admin.get(url).json()['rows'][0]['you'])
        # approved players only, each once, whole numbers in range – all or nothing
        for bad in (
            {},
            {'rows': 'x'},
            {'rows': [{**row, 'id': self.newbie.pk}]},
            {'rows': [{**row, 'id': 999999}]},
            {'rows': [row, row]},
            {'rows': [{**row, 'required': -1}]},
            {'rows': [{**row, 'required': 1.5}]},
            {'rows': [{**row, 'marches': 99}]},
            {'rows': [{**row, 'power': 100}]},
            {'rows': [{'id': self.player.pk}]},
        ):
            self.assertEqual(self.call('put', url, bad).status_code, 400, bad)
        self.assertEqual(EvaluationSettings.load().overview, [row])
        # a player who loses the approval drops out of the overview
        self.player.approved = False
        self.player.save()
        self.assertEqual(self.admin.get(url).json()['rows'], [])
        # an empty list takes it back
        self.player.approved = True
        self.player.save()
        self.assertEqual(self.call('put', url, {'rows': []}).json(), {'published_at': None, 'rows': []})

    def test_the_formations_of_the_commanders_live_in_the_database(self):
        """Gether 14. 10. 2026 (Slim: "nastaviť každého commandera, akú má mať formáciu")"""
        from guides.models import CommanderFormation

        CommanderFormation.objects.all().delete()
        CommanderFormation.objects.create(commander='Attila', formations=['wedge'])
        data = self.admin.get('/api/evaluation/').json()
        self.assertEqual(data['formations'], {'Attila': ['wedge']})
        version = data['formations_version']
        # saved with the variables when the page changed them, over the version it loaded: names like the roster, each
        # formation once, an empty list = any formation (the row goes away)
        formations = {'attila': [], 'IVAN IV': ['pincer', 'pincer', 'wedge']}
        body = {'settings': {'a': 1}, 'formations': formations, 'formations_version': version}
        res = self.call('put', '/api/evaluation/settings/', body)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['formations'], {'Ivan IV': ['pincer', 'wedge']})
        self.assertEqual(list(CommanderFormation.objects.values_list('commander', flat=True)), ['Ivan IV'])
        version = res.json()['formations_version']
        # changed meanwhile (the admin): a save over the old version is refused, nothing is saved
        CommanderFormation.objects.create(commander='Attila', formations=['arch'])
        res = self.call('put', '/api/evaluation/settings/', {**body, 'settings': {'z': 1}, 'formations_version': version})
        self.assertEqual((res.status_code, res.json()), (409, {'formations': 'stale'}))
        self.assertEqual(EvaluationSettings.load().data, {'a': 1})
        self.assertEqual(CommanderFormation.objects.count(), 2)
        # without them: they stay
        res = self.call('put', '/api/evaluation/settings/', {'settings': {}})
        self.assertEqual(res.json()['formations'], {'Attila': ['arch'], 'Ivan IV': ['pincer', 'wedge']})
        version = res.json()['formations_version']
        # a commander a march cannot name: nothing is saved
        body = {'settings': {'b': 2}, 'formations': {'Ivar': ['arch']}, 'formations_version': version}
        res = self.call('put', '/api/evaluation/settings/', body)
        self.assertEqual(res.json(), {'formations': 'unknown', 'names': ['Ivar']})
        self.assertEqual(EvaluationSettings.load().data, {})
        for bad in ('x', {'Attila': 'wedge'}, {'Attila': ['square']}, {'Attila': ['arch', 'v', 'delta']}):
            res = self.call('put', '/api/evaluation/settings/', {'settings': {}, 'formations': bad, 'formations_version': version})
            self.assertEqual(res.json(), {'formations': 'invalid'}, bad)
        # a player with the overview switch only may not
        self.player.evaluation_overview = True
        self.player.save()
        self.assertEqual(self.call('put', '/api/evaluation/settings/', body, self.nelly).status_code, 403)

    def test_the_commander_pairs_live_in_the_database(self):
        # the table the migration put in (meta-rok.com + RoKBattles), the best first, each order its own row
        data = self.admin.get('/api/evaluation/').json()
        pairs, version = data['pairs'], data['pairs_version']
        self.assertIn(['Ivan IV', 'Achilles', 116], pairs)
        self.assertIn(['Achilles', 'Ivan IV', 92], pairs)
        self.assertEqual([p[2] for p in pairs], sorted((p[2] for p in pairs), reverse=True))
        # saved with the variables over the version loaded: the whole table, names like the roster, the best first;
        # an empty row and the same commander twice are left out
        rows = [['ivan iv', 'ACHILLES', 110.25], ['Attila', 'Achilles', 90], ['', '', 0], ['Attila', 'attila', 50]]
        res = self.call('put', '/api/evaluation/settings/', {'settings': {'a': 1}, 'pairs': rows, 'pairs_version': version})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['pairs'], [['Ivan IV', 'Achilles', 110.2], ['Attila', 'Achilles', 90]])
        self.assertEqual(list(CommanderPair.objects.values_list('primary', flat=True)), ['Ivan IV', 'Attila'])
        version = res.json()['pairs_version']
        # only what changed is written
        attila = CommanderPair.objects.get(primary='Attila')
        rows = [['Ivan IV', 'Achilles', 116], ['Attila', 'Achilles', 90]]
        res = self.call('put', '/api/evaluation/settings/', {'settings': {'a': 1}, 'pairs': rows, 'pairs_version': version})
        self.assertEqual(CommanderPair.objects.get(primary='Attila').updated_at, attila.updated_at)
        version = res.json()['pairs_version']
        # changed meanwhile (the admin): a save over the old version is refused, nothing is saved
        CommanderPair.objects.create(primary='Arthur Pendragon', secondary='Ivan IV', points=112)
        res = self.call('put', '/api/evaluation/settings/', {'settings': {'z': 1}, 'pairs': rows, 'pairs_version': version})
        self.assertEqual((res.status_code, res.json()), (409, {'pairs': 'stale'}))
        self.assertEqual(EvaluationSettings.load().data, {'a': 1})
        self.assertEqual(CommanderPair.objects.count(), 3)
        # without the table: the variables saved, the table stays and comes back as it is now
        res = self.call('put', '/api/evaluation/settings/', {'settings': {'c': 3}})
        self.assertEqual(len(res.json()['pairs']), 3)
        version = res.json()['pairs_version']
        # a commander a march cannot name: nothing is saved, the names come back
        rows = [['Ivan IV', 'Achilles', 100], ['Ivar', 'Achiles', 50]]
        res = self.call('put', '/api/evaluation/settings/', {'settings': {'b': 2}, 'pairs': rows, 'pairs_version': version})
        self.assertEqual(res.json(), {'pairs': 'unknown', 'names': ['Achiles', 'Ivar']})
        self.assertEqual(EvaluationSettings.load().data, {'c': 3})
        for bad in ('x', [['A', 'B']], [['Attila', 'Achilles', 600]], [['Attila', 'Achilles', True]]):
            res = self.call('put', '/api/evaluation/settings/', {'settings': {}, 'pairs': bad, 'pairs_version': version})
            self.assertEqual(res.json(), {'pairs': 'invalid'}, bad)
        self.assertEqual(CommanderPair.objects.count(), 3)


    def test_every_commander_of_the_pair_table_can_be_picked(self):
        # the commanders of our guides count too (Gonzalo de Cordoba, Gajah Mada are not in the roster of the client)
        sync_guides()
        commander_index._cache.clear()
        known = commander_names()
        names = {name for pair in CommanderPair.objects.all() for name in (pair.primary, pair.secondary)}
        self.assertTrue(names)
        self.assertEqual({name for name in names if known.get(fold(name)) != name}, set())

    def test_the_migration_keeps_rows_changed_on_the_page(self):
        seed = import_module('guides.migrations.0012_commander_pairs').seed
        CommanderPair.objects.all().delete()
        row = EvaluationSettings.load()
        row.data = {
            'pairs': {
                'rows': [
                    ['Qin Shi Huang', 'Zhuge Liang', 120],  # the spreadsheet's, untouched: the new table
                    ['Arthur Pendragon', 'Achilles', 95],  # changed on the page: kept
                    ['Ivan IV', 'Achilles', 70],  # added on the page: kept
                ],
                'curve': 2,
            },
            'acclaim': {'minimum': 1},
        }
        row.save()
        seed(django_apps, None)
        points = {(p.primary, p.secondary): float(p.points) for p in CommanderPair.objects.all()}
        self.assertEqual(points[('Qin Shi Huang', 'Zhuge Liang')], 118)
        self.assertEqual(points[('Arthur Pendragon', 'Achilles')], 95)
        self.assertEqual(points[('Ivan IV', 'Achilles')], 70)
        self.assertEqual(points[('Achilles', 'Ivan IV')], 92)
        self.assertEqual(EvaluationSettings.load().data, {'pairs': {'curve': 2}, 'acclaim': {'minimum': 1}})


@override_settings(STORAGES=PLAIN_STATIC)
class EvaluationAdminTests(TestCase):
    """The variables in the Django admin (Gether 13. 10. 2026) as readable JSON; the commander pairs as a table with
    many rows at once from a spreadsheet."""

    url = '/admin/accounts/evaluationsettings/'
    pairs = '/admin/guides/commanderpair/'

    def setUp(self):
        self.client.force_login(User.objects.create_superuser('boss', password='x'))

    def change_url(self):
        return f'{self.url}{EvaluationSettings.load().pk}/change/'

    def test_superuser_only(self):
        self.client.force_login(User.objects.create_user('r4', password='x', is_staff=True))
        self.assertEqual(self.client.get(self.url).status_code, 403)
        self.assertEqual(self.client.get(self.pairs).status_code, 403)
        self.assertEqual(self.client.get(f'{self.pairs}import/').status_code, 403)

    def test_the_variables_as_json(self):
        self.assertRedirects(self.client.get(self.url), self.change_url())
        self.assertEqual(self.client.get(f'{self.url}add/').status_code, 403)
        row = EvaluationSettings.load()
        row.data = {'acclaim': {'minimum': 150000}}
        row.save()
        self.assertContains(self.client.get(self.change_url()), '&quot;minimum&quot;: 150000')
        data = json.dumps({'acclaim': {'minimum': 120000}})
        self.assertEqual(self.client.post(self.change_url(), {'data': data}).status_code, 302)
        self.assertEqual(EvaluationSettings.load().data, {'acclaim': {'minimum': 120000}})
        for bad in ('[1]', json.dumps({'t': 'x' * 300}), '{'):
            self.assertEqual(self.client.post(self.change_url(), {'data': bad}).status_code, 200, bad)
        # empty = the page's defaults
        self.assertEqual(self.client.post(self.change_url(), {'data': ''}).status_code, 302)
        self.assertEqual(EvaluationSettings.load().data, {})

    def test_pairs_one_by_one(self):
        page = self.client.get(self.pairs)
        self.assertContains(page, 'Ivan IV')
        self.assertContains(page, 'Vložiť z Excelu')
        new = {'primary': 'ivar the boneless', 'secondary': 'achilles', 'points': '60'}
        self.assertEqual(self.client.post(f'{self.pairs}add/', new).status_code, 302)
        self.assertTrue(CommanderPair.objects.filter(primary='Ivar the Boneless', secondary='Achilles', points=60).exists())
        # a name a march cannot have, the same commander twice, a pair already there, too many points
        for data in (
            {'primary': 'Ivar', 'secondary': 'Achilles', 'points': '60'},
            {'primary': 'Achilles', 'secondary': 'Achilles', 'points': '60'},
            {'primary': 'Ivan IV', 'secondary': 'Achilles', 'points': '60'},
            {'primary': 'Attila', 'secondary': 'Hector', 'points': '501'},
        ):
            self.assertEqual(self.client.post(f'{self.pairs}add/', data).status_code, 200, data)

    def test_points_saved_from_the_list(self):
        # a row whose commander is not pickable (any more) does not stop a save of the points from the list
        CommanderPair.objects.all().delete()
        good = CommanderPair.objects.create(primary='Ivan IV', secondary='Achilles', points=116)
        old = CommanderPair.objects.create(primary='Mulan', secondary='Achilles', points=40)
        form = {
            'form-TOTAL_FORMS': '2',
            'form-INITIAL_FORMS': '2',
            'form-0-id': str(good.pk),
            'form-0-points': '110',
            'form-1-id': str(old.pk),
            'form-1-points': '30',
            '_save': 'Uložiť',
        }
        self.assertEqual(self.client.post(self.pairs, form).status_code, 302)
        self.assertEqual(sorted(CommanderPair.objects.values_list('points', flat=True)), [30, 110])

    def test_many_pairs_from_a_spreadsheet(self):
        self.assertContains(self.client.get(f'{self.pairs}import/'), 'Ivan IV; Achilles; 116')
        # a tab from a spreadsheet, a decimal comma, any case: new pairs added, others' points changed, the rest stays
        lines = 'Achilles\tIvar the Boneless\t80\nivan iv; achilles; 99,5\n\n'
        self.assertEqual(self.client.post(f'{self.pairs}import/', {'lines': lines}).status_code, 302)
        points = {(p.primary, p.secondary): float(p.points) for p in CommanderPair.objects.all()}
        self.assertEqual(points[('Achilles', 'Ivar the Boneless')], 80)
        self.assertEqual(points[('Ivan IV', 'Achilles')], 99.5)
        self.assertEqual(points[('Achilles', 'Ivan IV')], 92)
        # errors by line, nothing saved
        bad = 'Atila; Achilles; 90\nAttila; Achilles\nAttila; Achilles; x\nAttila; Achilles; 900\nAttila; attila; 50'
        response = self.client.post(f'{self.pairs}import/', {'lines': bad, 'replace': 'on'})
        for error in ('1. riadok: neznámy commander „Atila“', '2. riadok', '3. riadok', '4. riadok', '5. riadok: primárny'):
            self.assertContains(response, error)
        self.assertGreater(CommanderPair.objects.count(), 100)
        # the whole table replaced
        self.client.post(f'{self.pairs}import/', {'lines': 'Attila; Achilles; 90', 'replace': 'on'})
        self.assertEqual(list(CommanderPair.objects.values_list('primary', 'secondary')), [('Attila', 'Achilles')])

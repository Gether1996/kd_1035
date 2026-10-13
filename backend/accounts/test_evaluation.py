from django.core.cache import cache
from django.test import Client, TestCase

from .models import EvaluationSettings, March, PlayerEvaluation
from .test_reminders import make_player


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
        self.assertEqual((row['power'], row['acclaim'], row['t4'], row['power_bonus']), (None, None, False, 0.0))
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
        self.assertEqual(res.json(), {'id': self.player.pk, 'power': 101.5, 'acclaim': 5600000, 't4': False, 'power_bonus': 0.0})
        res = self.call('patch', url, {'t4': True, 'power_bonus': -6})
        self.assertEqual((res.json()['power'], res.json()['t4'], res.json()['power_bonus']), (101.5, True, -6.0))
        self.assertEqual(self.call('patch', url, {'power': None}).json()['power'], None)
        for bad in ({}, {'power': -1}, {'power': 'x'}, {'power': 1.25}, {'acclaim': -5}, {'t4': 'yes'}, {'power_bonus': 5000}):
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

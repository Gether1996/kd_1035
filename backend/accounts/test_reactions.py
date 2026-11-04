from django.core.cache import cache
from django.test import Client, TestCase

from .models import Reaction
from .test_reminders import make_player

URL = '/api/reactions/brana-8/'


class ReactionTests(TestCase):
    """Likes and hearts on the home page's picture (Gether 4. 11. 2026)"""

    def setUp(self):
        cache.clear()  # the throttle
        self.nelly = make_player()
        self.boris = make_player(discord_id='80351110224678913')
        self.client = Client(enforce_csrf_checks=True)

    def signed_in(self, player):
        client = Client(enforce_csrf_checks=True)
        client.force_login(player.user)
        client.get('/api/auth/me/')  # sets the csrftoken cookie, like the page
        return client

    def post(self, client, data):
        return client.post(URL, data, content_type='application/json', HTTP_X_CSRFTOKEN=client.cookies['csrftoken'].value)

    def test_everyone_reads_the_counts(self):
        Reaction.objects.create(player=self.nelly, target='brana-8', kind='like')
        Reaction.objects.create(player=self.boris, target='brana-8', kind='like')
        Reaction.objects.create(player=self.boris, target='brana-8', kind='heart')
        # another picture does not count here
        Reaction.objects.create(player=self.boris, target='other', kind='heart')
        self.assertEqual(Client().get(URL).json(), {'like': 2, 'heart': 1, 'mine': []})
        self.assertEqual(self.signed_in(self.boris).get(URL).json(), {'like': 2, 'heart': 1, 'mine': ['heart', 'like']})

    def test_a_player_adds_and_takes_back(self):
        client = self.signed_in(self.nelly)
        self.assertEqual(self.post(client, {'kind': 'heart'}).json(), {'like': 0, 'heart': 1, 'mine': ['heart']})
        self.assertEqual(self.post(client, {'kind': 'like'}).json(), {'like': 1, 'heart': 1, 'mine': ['heart', 'like']})
        # the second click takes it back
        self.assertEqual(self.post(client, {'kind': 'heart'}).json(), {'like': 1, 'heart': 0, 'mine': ['like']})
        self.assertEqual(Reaction.objects.count(), 1)
        # the reactions go with the account
        self.nelly.delete_account()
        self.assertFalse(Reaction.objects.exists())

    def test_only_signed_in_players_known_kinds_and_pictures(self):
        self.assertEqual(self.client.post(URL, {'kind': 'like'}, content_type='application/json').status_code, 403)
        client = self.signed_in(self.nelly)
        for bad in ({}, {'kind': 'love'}, {'kind': ['like']}, ['like']):
            self.assertEqual(self.post(client, bad).status_code, 400, bad)
        self.assertEqual(Client().get('/api/reactions/anything/').status_code, 404)
        res = client.post('/api/reactions/anything/', {'kind': 'like'}, content_type='application/json',
                          HTTP_X_CSRFTOKEN=client.cookies['csrftoken'].value)  # fmt: skip
        self.assertEqual(res.status_code, 404)
        # without the CSRF token: refused
        self.assertEqual(client.post(URL, {'kind': 'like'}, content_type='application/json').status_code, 403)
        self.assertFalse(Reaction.objects.exists())

    def test_the_superadmin_sees_who(self):
        Reaction.objects.create(player=self.nelly, target='brana-8', kind='like')
        Reaction.objects.create(player=self.boris, target='brana-8', kind='like')
        Reaction.objects.create(player=self.boris, target='brana-8', kind='heart')
        self.boris.ingame_name = 'Boris CzF'
        self.boris.save()
        admin = make_player(discord_id='80351110224678914', is_superuser=True, is_staff=True)
        data = self.signed_in(admin).get(URL).json()
        self.assertEqual(data['who'], {'like': ['Boris CzF', 'Nelly'], 'heart': ['Boris CzF']})
        # nobody else gets the names
        self.assertNotIn('who', self.signed_in(self.nelly).get(URL).json())
        self.assertNotIn('who', Client().get(URL).json())

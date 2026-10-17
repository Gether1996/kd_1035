from datetime import timedelta
from unittest import mock
from urllib.parse import parse_qs, urlsplit

from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import Client, TestCase, override_settings
from django.utils import timezone

from . import discord_oauth, local_auth, newcomers
from .models import Player, PlayerSettings
from .tests import DISCORD, PROFILE, make_player

PASSWORD = 'Kral0vstvo-1035'


def form(**kwargs):
    return {'name': 'Ľubo Kráľ', 'password': PASSWORD, 'lang': 'sk', 'website': '', 'elapsed': 9000, **kwargs}


@override_settings(DEBUG=True)
class LocalAuthTestCase(TestCase):
    def setUp(self):
        cache.clear()  # the throttles
        self.addCleanup(cache.clear)
        self.client = Client(enforce_csrf_checks=True)
        self.client.get('/api/auth/me/')

    @property
    def token(self):
        # Django gives the browser a new CSRF token at every sign-in
        return self.client.cookies['csrftoken'].value

    def post(self, path, data):
        return self.client.post(path, data, content_type='application/json', HTTP_X_CSRFTOKEN=self.token)

    def sign_up(self, **kwargs):
        return self.post('/api/auth/local/signup/', form(**kwargs))

    def me(self):
        return self.client.get('/api/auth/me/').json()['user']

    def fresh_client(self):
        """A second browser – its own session and CSRF token."""
        self.client = Client(enforce_csrf_checks=True)
        self.client.get('/api/auth/me/')


class SignUpTests(LocalAuthTestCase):
    def test_sign_up_creates_a_waiting_player_and_signs_in(self):
        response = self.sign_up()
        self.assertEqual(response.status_code, 201)
        user = response.json()['user']
        self.assertEqual(user['ingame_name'], 'Ľubo Kráľ')
        self.assertEqual(user['name'], 'Ľubo Kráľ')
        self.assertTrue(user['local'])
        self.assertIsNone(user['discord_id'])
        self.assertEqual(user['avatar_url'], '/img/avatar-local.svg')
        self.assertFalse(user['approved'])
        self.assertFalse(user['is_staff'])

        player = Player.objects.get()
        self.assertEqual(player.login, 'ľubo kráľ')
        self.assertFalse(player.remind_discord)  # no bot DMs
        self.assertFalse(player.announced)  # the superadmin hears of them
        self.assertTrue(player.user.username.startswith('local_'))
        self.assertTrue(player.user.check_password(PASSWORD))
        self.assertTrue(self.me()['local'])

    def test_needs_the_csrf_token(self):
        response = self.client.post('/api/auth/local/signup/', form(), content_type='application/json')
        self.assertEqual(response.status_code, 403)
        self.assertFalse(Player.objects.exists())

    def test_never_approved_at_once(self):
        PlayerSettings.objects.update_or_create(pk=1, defaults={'auto_approve': True})
        self.sign_up()
        self.assertFalse(Player.objects.get().approved)

    def test_the_hidden_field_and_a_form_posted_at_once_look_like_a_bot(self):
        for data in ({'website': 'https://spam.example'}, {'elapsed': 200}, {'elapsed': '9000'}, {'elapsed': None}):
            with self.subTest(**data):
                self.assertEqual(self.sign_up(**data).json(), {'detail': 'invalid'})
        self.assertFalse(Player.objects.exists())

    def test_password_rules(self):
        cases = {
            'short': ['password_too_short'],
            '73914682055': ['password_entirely_numeric'],
            'password123': ['password_too_common'],
            'x' * 129: ['password_too_long'],
        }
        for password, errors in cases.items():
            with self.subTest(password=password):
                response = self.sign_up(password=password)
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json(), {'detail': 'password', 'errors': errors})
        self.assertEqual(self.sign_up(password=None).json()['errors'], ['required'])
        self.assertFalse(Player.objects.exists())

    def test_name_is_required_and_trimmed(self):
        for name in ('', ' ', 'x', 'a' * 33, 'bad\u0000name', 42):
            with self.subTest(name=name):
                self.assertEqual(self.sign_up(name=name).json(), {'detail': 'name'})
        self.assertEqual(self.sign_up(name='  Nelly   the  Great ').status_code, 201)
        self.assertEqual(Player.objects.get().ingame_name, 'Nelly the Great')

    def test_an_in_game_name_of_another_player_is_taken(self):
        make_player(ingame_name='ĽUBO KRÁĽ')  # a Discord player – nobody signs up as them
        response = self.sign_up()
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json(), {'detail': 'name_taken'})
        self.assertEqual(Player.objects.count(), 1)

    def test_at_most_ten_wait_for_the_approval(self):
        for i in range(local_auth.PENDING_CAP):
            user = User.objects.create_user(f'local_{i}')
            Player.objects.create(user=user, ingame_name=f'Bot {i}', login=f'bot {i}')
        self.assertFalse(self.client.get('/api/auth/me/').json()['signup_open'])
        response = self.sign_up()
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json(), {'detail': 'full'})

        # the superadmin approves one: the place is free again; Discord players never count
        Player.objects.filter(login='bot 0').update(approved=True)
        make_player()
        self.assertTrue(self.client.get('/api/auth/me/').json()['signup_open'])
        self.assertEqual(self.sign_up().status_code, 201)

    def test_three_accounts_an_hour_from_one_address(self):
        for i in range(3):
            self.fresh_client()
            self.assertEqual(self.sign_up(name=f'Hráč {i}').status_code, 201)
        self.fresh_client()
        self.assertEqual(self.sign_up(name='Hráč 3').status_code, 429)
        # a refused password does not use the limit up
        cache.clear()
        for _ in range(5):
            self.sign_up(name='Hráč 4', password='short')
        self.assertEqual(self.sign_up(name='Hráč 4').status_code, 201)

    def test_signed_in_player_cannot_sign_up_again(self):
        self.sign_up()
        self.assertEqual(self.sign_up(name='Druhý').json(), {'detail': 'signed_in'})

    def test_the_superadmin_is_told_without_a_discord_mention(self):
        self.sign_up()
        message = newcomers.message(Player.objects.get())['embeds'][0]
        self.assertIn('Discord: bez Discordu (meno v hre a heslo)', message['description'])
        self.assertNotIn('<@None>', message['description'])
        self.assertIn('registrácia bez Discordu', message['footer']['text'])


class SignInTests(LocalAuthTestCase):
    def setUp(self):
        super().setUp()
        self.sign_up()
        self.fresh_client()

    def test_sign_in_with_the_in_game_name_in_any_case(self):
        response = self.post('/api/auth/local/login/', {'name': ' ľUBO   kRÁĽ ', 'password': PASSWORD})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['user']['ingame_name'], 'Ľubo Kráľ')
        self.assertEqual(self.me()['ingame_name'], 'Ľubo Kráľ')

    def test_one_answer_for_a_wrong_password_and_an_unknown_name(self):
        for data in (
            {'name': 'Ľubo Kráľ', 'password': 'wrong-password'},
            {'name': 'Nikto', 'password': PASSWORD},
            {'name': None, 'password': None},
            {},
        ):
            with self.subTest(**data):
                response = self.post('/api/auth/local/login/', data)
                self.assertEqual((response.status_code, response.json()), (400, {'detail': 'invalid'}))
        self.assertIsNone(self.me())

    def test_needs_the_csrf_token(self):
        response = self.client.post(
            '/api/auth/local/login/', {'name': 'Ľubo Kráľ', 'password': PASSWORD}, content_type='application/json'
        )
        self.assertEqual(response.status_code, 403)

    def test_a_discord_player_cannot_sign_in_with_a_password(self):
        player = make_player('42', ingame_name='Nelly')
        player.user.set_password(PASSWORD)
        player.user.save()
        response = self.post('/api/auth/local/login/', {'name': 'Nelly', 'password': PASSWORD})
        self.assertEqual(response.status_code, 400)

    def test_a_blocked_player_cannot_sign_in(self):
        User.objects.filter(username__startswith='local_').update(is_active=False)
        response = self.post('/api/auth/local/login/', {'name': 'Ľubo Kráľ', 'password': PASSWORD})
        self.assertEqual(response.status_code, 400)

    def test_attempts_are_limited(self):
        for _ in range(local_auth.SignInThrottle().num_requests):
            self.post('/api/auth/local/login/', {'name': 'Ľubo Kráľ', 'password': 'wrong-password'})
        response = self.post('/api/auth/local/login/', {'name': 'Ľubo Kráľ', 'password': PASSWORD})
        self.assertEqual(response.status_code, 429)

    def test_no_admin_rights_from_the_database(self):
        User.objects.filter(username__startswith='local_').update(is_staff=True, is_superuser=True)
        self.post('/api/auth/local/login/', {'name': 'Ľubo Kráľ', 'password': PASSWORD})
        with override_settings(SUPERUSER_GUARD=True):
            user = self.me()
        self.assertFalse(user['is_staff'])
        self.assertFalse(user['is_superuser'])

    def test_the_new_in_game_name_is_the_login(self):
        self.post('/api/auth/local/login/', {'name': 'Ľubo Kráľ', 'password': PASSWORD})
        response = self.client.patch(
            '/api/auth/me/', {'ingame_name': 'Ľubo II'}, content_type='application/json', HTTP_X_CSRFTOKEN=self.token
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Player.objects.get().login, 'ľubo ii')

        make_player('42', ingame_name='Nelly')
        response = self.client.patch(
            '/api/auth/me/', {'ingame_name': 'NELLY'}, content_type='application/json', HTTP_X_CSRFTOKEN=self.token
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Player.objects.get(discord_id=None).login, 'ľubo ii')

        self.fresh_client()
        self.assertEqual(self.post('/api/auth/local/login/', {'name': 'Ľubo II', 'password': PASSWORD}).status_code, 200)


class PasswordTests(LocalAuthTestCase):
    def setUp(self):
        super().setUp()
        self.sign_up()
        self.player = Player.objects.get()

    def test_change_password(self):
        path = '/api/auth/local/password/'
        self.assertEqual(self.post(path, {'current': 'wrong', 'password': 'Nove-heslo-77'}).json(), {'detail': 'current'})
        self.assertEqual(self.post(path, {'current': PASSWORD, 'password': 'short'}).json()['detail'], 'password')
        self.assertEqual(self.post(path, {'current': PASSWORD, 'password': 'Nove-heslo-77'}).status_code, 204)
        self.assertIsNotNone(self.me())  # this session stays
        self.player.user.refresh_from_db()
        self.assertTrue(self.player.user.check_password('Nove-heslo-77'))

    def test_a_discord_player_has_no_password_to_change(self):
        self.client.force_login(make_player('42').user)
        self.client.get('/api/auth/me/')
        response = self.post('/api/auth/local/password/', {'current': '', 'password': 'Nove-heslo-77'})
        self.assertEqual(response.status_code, 403)

    def superadmin(self):
        self.client.force_login(User.objects.create_superuser('boss', password='x'))
        self.client.get('/api/auth/me/')

    def test_the_superadmin_gives_a_code_for_a_new_password(self):
        self.superadmin()
        response = self.post(f'/api/kvk/reviewers/{self.player.pk}/reset-code/', {})
        self.assertEqual(response.status_code, 200)
        code = response.json()['code']
        self.assertRegex(code, r'^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$')
        self.player.refresh_from_db()
        self.assertNotIn(code.replace('-', ''), self.player.reset_code)  # only its hash

        self.fresh_client()
        reset = {'name': 'ľubo kráľ', 'code': code.lower().replace('-', ' '), 'password': 'short'}
        self.assertEqual(self.post('/api/auth/local/reset/', reset).json()['detail'], 'password')
        response = self.post('/api/auth/local/reset/', {**reset, 'password': 'Nove-heslo-77'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['user']['ingame_name'], 'Ľubo Kráľ')
        # used once
        self.fresh_client()
        self.assertEqual(self.post('/api/auth/local/reset/', {**reset, 'password': 'Ine-heslo-88'}).status_code, 400)
        self.assertEqual(
            self.post('/api/auth/local/login/', {'name': 'Ľubo Kráľ', 'password': 'Nove-heslo-77'}).status_code, 200
        )

    def test_a_code_is_valid_three_days(self):
        code = local_auth.new_code(self.player)
        self.fresh_client()
        reset = {'name': 'Ľubo Kráľ', 'code': code, 'password': 'Nove-heslo-77'}
        with mock.patch('django.utils.timezone.now', return_value=timezone.now() + timedelta(days=3, minutes=1)):
            self.assertEqual(self.post('/api/auth/local/reset/', reset).json(), {'detail': 'invalid'})
        self.assertEqual(self.post('/api/auth/local/reset/', {**reset, 'code': 'AAAA-AAAA'}).status_code, 400)
        self.assertEqual(self.post('/api/auth/local/reset/', reset).status_code, 200)

    def test_only_the_superadmin_and_only_for_players_without_discord(self):
        self.assertEqual(self.post(f'/api/kvk/reviewers/{self.player.pk}/reset-code/', {}).status_code, 403)
        self.superadmin()
        discord = make_player('42')
        self.assertEqual(self.post(f'/api/kvk/reviewers/{discord.pk}/reset-code/', {}).status_code, 403)

    def test_the_superadmin_deletes_a_player_waiting_for_the_approval(self):
        self.superadmin()
        path = f'/api/kvk/reviewers/{self.player.pk}/delete/'
        Player.objects.filter(pk=self.player.pk).update(approved=True)
        self.assertEqual(self.client.delete(path, HTTP_X_CSRFTOKEN=self.token).status_code, 409)
        Player.objects.filter(pk=self.player.pk).update(approved=False)
        self.assertEqual(self.client.delete(path, HTTP_X_CSRFTOKEN=self.token).status_code, 204)
        self.assertFalse(Player.objects.exists())
        self.assertEqual(list(User.objects.values_list('username', flat=True)), ['boss'])

    def test_the_players_list_tells_who_is_without_discord(self):
        make_player('42')
        self.superadmin()
        rows = self.client.get('/api/kvk/reviewers/').json()['players']
        self.assertEqual(sorted(row['local'] for row in rows), [False, True])


class WithoutDiscordTests(LocalAuthTestCase):
    def setUp(self):
        super().setUp()
        self.sign_up()

    def test_no_reminders_and_no_alarms(self):
        for path in ('/api/me/reminders/', '/api/me/alarms/'):
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path).status_code, 403)

    def test_approval_sends_no_welcome_dm(self):
        player = Player.objects.get()
        player.approved = True
        self.assertEqual(player.approval_changed(False), ['welcome_due'])
        self.assertFalse(player.welcome_due)

    def test_deletes_own_account(self):
        self.assertEqual(self.client.delete('/api/auth/me/', HTTP_X_CSRFTOKEN=self.token).status_code, 204)
        self.assertFalse(Player.objects.exists())
        self.assertFalse(User.objects.exists())


@override_settings(**DISCORD)
class LinkDiscordTests(LocalAuthTestCase):
    """The player without Discord links the account – the same player, with the bot's DMs from now on."""

    def setUp(self):
        super().setUp()
        self.sign_up()
        self.player = Player.objects.get()
        self.player.approved = self.player.kvk_reviewer = True
        self.player.save()
        for name, value in (('exchange_code', 'tok'), ('fetch_user', dict(PROFILE))):
            patcher = mock.patch.object(discord_oauth, name, return_value=value)
            self.addCleanup(patcher.stop)
            patcher.start()

    def link(self, **params):
        response = self.client.get('/api/auth/discord/login/', {'next': '/ucet', **params})
        state = parse_qs(urlsplit(response['Location']).query)['state'][0]
        return self.client.get('/api/auth/discord/callback/', {'state': state, 'code': 'abc'})

    def test_links_the_same_account(self):
        response = self.link(link='1')
        self.assertRedirects(response, '/ucet?login=linked', fetch_redirect_response=False)
        self.assertEqual(Player.objects.count(), 1)
        player = Player.objects.get()
        self.assertEqual(player.pk, self.player.pk)
        self.assertEqual(player.discord_id, PROFILE['id'])
        self.assertEqual((player.username, player.global_name), ('nelly', 'Nelly'))
        self.assertEqual(player.ingame_name, 'Ľubo Kráľ')
        self.assertTrue(player.approved and player.kvk_reviewer)  # nothing lost
        self.assertTrue(player.remind_discord)
        self.assertIsNone(player.login)
        self.assertFalse(player.user.has_usable_password())
        user = self.me()
        self.assertFalse(user['local'])
        self.assertEqual(user['discord_id'], PROFILE['id'])
        # the reminders open, the password sign-in is gone
        self.assertEqual(self.client.get('/api/me/reminders/').status_code, 200)
        self.fresh_client()
        self.assertEqual(self.post('/api/auth/local/login/', {'name': 'Ľubo Kráľ', 'password': PASSWORD}).status_code, 400)

    def test_a_discord_account_with_its_own_player_is_not_merged(self):
        make_player(PROFILE['id'])
        response = self.link(link='1')
        self.assertRedirects(response, '/ucet?login=taken', fetch_redirect_response=False)
        self.assertIsNone(Player.objects.get(pk=self.player.pk).discord_id)
        self.assertTrue(self.me()['local'])  # still signed in without Discord

    def test_without_link_a_discord_sign_in_is_another_account(self):
        self.link()
        self.assertEqual(Player.objects.count(), 2)
        self.assertIsNone(Player.objects.get(pk=self.player.pk).discord_id)

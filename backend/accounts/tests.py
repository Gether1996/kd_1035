import io
import json
import sqlite3
import tempfile
import urllib.error
from pathlib import Path
from unittest import mock
from urllib.parse import parse_qs, urlsplit

from django.conf import settings
from django.contrib.admin.models import ADDITION, LogEntry
from django.contrib.auth.models import Group, User
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import Client, TestCase, TransactionTestCase, override_settings

from kingdom import snapshot
from kingdom.models import Alliance

from . import discord_oauth
from .models import MAX_GOVERNORS, Governor, Player

DISCORD = {'DISCORD_CLIENT_ID': '1234567890', 'DISCORD_CLIENT_SECRET': 'shh', 'SITE_URL': 'https://kd1035.test'}
CALLBACK = 'https://kd1035.test/api/auth/discord/callback/'
PROFILE = {
    'id': '80351110224678912',
    'username': 'nelly',
    'global_name': 'Nelly',
    'avatar': 'a_8342729096ea3675442027381ff50dfe',
}
PLAIN_STATIC = {
    'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
    'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
}


def make_player(discord_id='80351110224678912', **kwargs):
    user = User.objects.create_user(f'discord_{discord_id}', **kwargs)
    return Player.objects.create(user=user, discord_id=discord_id, username='nelly', global_name='Nelly')


class PlayerTests(TestCase):
    def test_avatar_url(self):
        player = Player(discord_id='80351110224678912', avatar='8342729096ea3675442027381ff50dfe')
        self.assertEqual(
            player.avatar_url,
            'https://cdn.discordapp.com/avatars/80351110224678912/8342729096ea3675442027381ff50dfe.png?size=64',
        )
        player.avatar = ''
        # (80351110224678912 >> 22) % 6 == 5
        self.assertEqual(player.avatar_url, 'https://cdn.discordapp.com/embed/avatars/5.png')

    def test_name_prefers_display_name(self):
        self.assertEqual(Player(username='nelly', global_name='Nelly').name, 'Nelly')
        self.assertEqual(Player(username='nelly').name, 'nelly')


@override_settings(**DISCORD)
class DiscordOAuthTests(TestCase):
    def response(self, data):
        return io.BytesIO(json.dumps(data).encode())

    def test_authorize_url(self):
        url = urlsplit(discord_oauth.authorize_url('abc', CALLBACK))
        self.assertEqual(f'{url.scheme}://{url.netloc}{url.path}', 'https://discord.com/oauth2/authorize')
        self.assertEqual(
            parse_qs(url.query),
            {
                'response_type': ['code'],
                'client_id': ['1234567890'],
                'scope': ['identify'],
                'state': ['abc'],
                'redirect_uri': [CALLBACK],
                'prompt': ['none'],
            },
        )

    def test_exchange_code_posts_form_with_client_credentials(self):
        with mock.patch('urllib.request.urlopen', return_value=self.response({'access_token': 'tok'})) as urlopen:
            self.assertEqual(discord_oauth.exchange_code('the-code', CALLBACK), 'tok')
        request = urlopen.call_args.args[0]
        self.assertEqual(request.full_url, 'https://discord.com/api/v10/oauth2/token')
        self.assertEqual(request.get_method(), 'POST')
        self.assertEqual(request.get_header('Content-type'), 'application/x-www-form-urlencoded')
        self.assertEqual(request.get_header('Authorization'), 'Basic MTIzNDU2Nzg5MDpzaGg=')  # 1234567890:shh
        self.assertTrue(request.get_header('User-agent').startswith('KD1035Bot'))
        self.assertEqual(
            parse_qs(request.data.decode()),
            {'grant_type': ['authorization_code'], 'code': ['the-code'], 'redirect_uri': [CALLBACK]},
        )

    def test_fetch_user_with_bearer_token(self):
        with mock.patch('urllib.request.urlopen', return_value=self.response(PROFILE)) as urlopen:
            self.assertEqual(discord_oauth.fetch_user('tok'), PROFILE)
        request = urlopen.call_args.args[0]
        self.assertEqual(request.full_url, 'https://discord.com/api/v10/users/@me')
        self.assertEqual(request.get_header('Authorization'), 'Bearer tok')

    def test_errors_raise_oauth_error_without_the_token(self):
        refused = urllib.error.HTTPError(
            'https://discord.com', 401, 'Unauthorized', {}, io.BytesIO(b'{"message": "401: Unauthorized"}')
        )
        for side_effect in (refused, urllib.error.URLError('down'), TimeoutError()):
            with mock.patch('urllib.request.urlopen', side_effect=side_effect):
                with self.assertRaises(discord_oauth.OAuthError) as ctx:
                    discord_oauth.fetch_user('secret-token')
                self.assertNotIn('secret-token', str(ctx.exception))
        with mock.patch('urllib.request.urlopen', return_value=self.response({'token_type': 'Bearer'})):
            with self.assertRaises(discord_oauth.OAuthError):
                discord_oauth.exchange_code('x', CALLBACK)
        with mock.patch('urllib.request.urlopen', return_value=self.response({'id': '../1', 'username': 'x'})):
            with self.assertRaises(discord_oauth.OAuthError):
                discord_oauth.fetch_user('tok')


@override_settings(**DISCORD)
class LoginFlowTests(TestCase):
    def setUp(self):
        cache.clear()  # callback throttle
        self.exchange = self.patch('exchange_code', return_value='tok')
        self.fetch = self.patch('fetch_user', return_value=dict(PROFILE))

    def patch(self, name, **kwargs):
        patcher = mock.patch.object(discord_oauth, name, **kwargs)
        self.addCleanup(patcher.stop)
        return patcher.start()

    def start(self, next_url=None):
        """GET login/ → the state sent to Discord."""
        response = self.client.get('/api/auth/discord/login/', {'next': next_url} if next_url else {})
        self.assertEqual(response.status_code, 302)
        return parse_qs(urlsplit(response['Location']).query)['state'][0]

    def callback(self, **params):
        return self.client.get('/api/auth/discord/callback/', params)

    def logged_in(self):
        return '_auth_user_id' in self.client.session

    def test_login_redirects_to_discord(self):
        response = self.client.get('/api/auth/discord/login/', {'next': '/cz/ucet'})
        url = urlsplit(response['Location'])
        query = parse_qs(url.query)
        self.assertEqual(response.status_code, 302)
        self.assertEqual(f'{url.scheme}://{url.netloc}{url.path}', 'https://discord.com/oauth2/authorize')
        self.assertEqual(query['client_id'], ['1234567890'])
        self.assertEqual(query['scope'], ['identify'])
        self.assertEqual(query['redirect_uri'], [CALLBACK])
        self.assertGreaterEqual(len(query['state'][0]), 32)
        self.assertEqual(self.client.session['discord_oauth_state'], query['state'][0])
        self.assertEqual(self.client.session['discord_oauth_next'], '/cz/ucet')
        self.assertIn('no-store', response['Cache-Control'])
        self.assertNotEqual(self.start(), query['state'][0])  # random every time

    @override_settings(DISCORD_CLIENT_ID='', DISCORD_CLIENT_SECRET='')
    def test_login_is_404_when_not_configured(self):
        self.assertEqual(self.client.get('/api/auth/discord/login/').status_code, 404)
        self.assertEqual(self.client.get('/api/auth/discord/callback/').status_code, 404)

    def test_success_creates_player_and_logs_in(self):
        state = self.start('/o-nas')
        response = self.callback(state=state, code='abc')
        self.assertRedirects(response, '/o-nas', fetch_redirect_response=False)
        self.exchange.assert_called_once_with('abc', CALLBACK)
        self.fetch.assert_called_once_with('tok')

        user = User.objects.get()
        self.assertEqual(user.username, 'discord_80351110224678912')
        self.assertEqual(user.first_name, 'Nelly')
        self.assertFalse(user.has_usable_password())
        self.assertFalse(user.is_staff or user.is_superuser)
        self.assertEqual(
            (user.player.discord_id, user.player.username, user.player.global_name, user.player.avatar),
            ('80351110224678912', 'nelly', 'Nelly', PROFILE['avatar']),
        )
        self.assertTrue(self.logged_in())
        self.assertEqual(self.client.get('/api/auth/me/').json()['user']['name'], 'Nelly')

    def test_second_login_updates_without_duplicating(self):
        self.callback(state=self.start(), code='abc')
        user = User.objects.get()
        user.is_staff = True  # granted by leadership in the admin – a sign-in must not take it away
        user.save()
        self.client.logout()
        self.fetch.return_value = {**PROFILE, 'global_name': None, 'username': 'nelly2', 'avatar': None}
        response = self.callback(state=self.start(), code='def')
        self.assertRedirects(response, '/ucet', fetch_redirect_response=False)
        self.assertEqual(User.objects.count(), 1)
        self.assertEqual(Player.objects.count(), 1)
        player = Player.objects.select_related('user').get()
        self.assertEqual((player.username, player.global_name, player.avatar), ('nelly2', '', ''))
        self.assertEqual(player.user.first_name, 'nelly2')
        self.assertTrue(player.user.is_staff)
        self.assertTrue(self.logged_in())

    def test_user_renamed_in_the_admin_keeps_the_account(self):
        player = make_player()
        User.objects.filter(pk=player.user_id).update(username='Nelly (R4)')
        response = self.callback(state=self.start(), code='abc')
        self.assertRedirects(response, '/ucet', fetch_redirect_response=False)
        self.assertEqual(list(User.objects.values_list('pk', 'username')), [(player.user_id, 'Nelly (R4)')])
        self.assertEqual(Player.objects.get().avatar, PROFILE['avatar'])
        self.assertEqual(self.client.session['_auth_user_id'], str(player.user_id))

    def test_missing_or_wrong_state_never_logs_in(self):
        # no login/ before → no state in the session
        response = self.callback(state='x', code='abc')
        self.assertRedirects(response, '/ucet?login=error', fetch_redirect_response=False)
        self.start('/cz/ucet')
        response = self.callback(state='wrong', code='abc')
        self.assertRedirects(response, '/cz/ucet?login=error', fetch_redirect_response=False)
        state = self.start()
        self.assertRedirects(self.callback(code='abc'), '/ucet?login=error', fetch_redirect_response=False)
        # state is single use: the first failed attempt consumed it
        self.callback(state=state, code='abc')
        self.callback(state='žltý kôň', code='abc')  # non-ASCII must not crash compare_digest
        self.exchange.assert_not_called()
        self.assertFalse(User.objects.exists())
        self.assertFalse(self.logged_in())

    def test_state_cannot_be_replayed(self):
        state = self.start()
        self.callback(state=state, code='abc')
        self.client.logout()
        response = self.callback(state=state, code='abc')
        self.assertRedirects(response, '/ucet?login=error', fetch_redirect_response=False)
        self.assertFalse(self.logged_in())

    def test_access_denied_is_cancelled(self):
        self.start('/o-nas?x=1&login=error')
        response = self.callback(error='access_denied', state='whatever')
        self.assertRedirects(response, '/o-nas?x=1&login=cancelled', fetch_redirect_response=False)
        self.exchange.assert_not_called()
        self.start()
        self.assertRedirects(self.callback(error='invalid_scope'), '/ucet?login=error', fetch_redirect_response=False)

    def test_discord_failure_redirects_with_error(self):
        self.fetch.side_effect = discord_oauth.OAuthError('Discord odpovedal 401')
        with self.assertLogs('accounts.views', 'WARNING') as logs:
            response = self.callback(state=self.start(), code='abc')
        self.assertRedirects(response, '/ucet?login=error', fetch_redirect_response=False)
        self.assertNotIn('tok', ''.join(logs.output))
        self.assertFalse(User.objects.exists())
        self.assertFalse(self.logged_in())

    def test_open_redirects_fall_back_to_the_account_page(self):
        evil_urls = [
            'https://evil.example',
            '//evil.example',
            '/\\evil.example',
            '///evil.example',
            'javascript:alert(1)',
            'o-nas',  # not a path
        ]
        for evil in evil_urls:
            with self.subTest(evil):
                self.start(evil)
                self.assertEqual(self.client.session['discord_oauth_next'], '/ucet')
        self.start('/navody/vybava?tab=1')
        self.assertEqual(self.client.session['discord_oauth_next'], '/navody/vybava?tab=1')

    def test_inactive_user_is_not_logged_in(self):
        make_player(is_active=False)
        response = self.callback(state=self.start(), code='abc')
        self.assertRedirects(response, '/ucet?login=error', fetch_redirect_response=False)
        self.assertFalse(self.logged_in())

    def test_callback_is_throttled_per_ip(self):
        for _ in range(20):
            self.callback(state=self.start(), code='abc')
            self.client.logout()
        self.assertEqual(self.exchange.call_count, 20)
        response = self.callback(state=self.start(), code='abc')
        self.assertRedirects(response, '/ucet?login=error', fetch_redirect_response=False)
        self.assertEqual(self.exchange.call_count, 20)
        self.assertFalse(self.logged_in())

    @override_settings(REST_FRAMEWORK={**settings.REST_FRAMEWORK, 'NUM_PROXIES': 2})
    def test_throttle_ignores_forwarded_for_sent_by_the_client(self):
        # server: HTTPS proxy appends the visitor, nginx appends the HTTPS proxy; anything the visitor put
        # in front of that must not give them a fresh limit
        def callback(forwarded_for):
            self.client.get(
                '/api/auth/discord/callback/',
                {'state': self.start(), 'code': 'abc'},
                headers={'X-Forwarded-For': forwarded_for},
            )
            self.client.logout()

        for i in range(21):
            callback(f'10.0.0.{i}, 203.0.113.7, 172.18.0.1')
        self.assertEqual(self.exchange.call_count, 20)
        callback('203.0.113.8, 172.18.0.1')  # another visitor has their own limit
        self.assertEqual(self.exchange.call_count, 21)

    def test_error_from_the_url_cannot_forge_log_lines(self):
        self.start()
        with self.assertLogs('accounts.views', 'WARNING') as logs:
            self.callback(error='server_error\nCRITICAL fake entry')
        self.assertNotIn('\n', ''.join(logs.output))


class MeTests(TestCase):
    @override_settings(DISCORD_CLIENT_ID='', DISCORD_CLIENT_SECRET='')
    def test_without_config_login_is_disabled(self):
        response = self.client.get('/api/auth/me/')
        self.assertEqual(response.json(), {'login_enabled': False, 'user': None})
        self.assertIn('csrftoken', response.cookies)
        self.assertIn('no-store', response['Cache-Control'])

    @override_settings(**DISCORD)
    def test_signed_in_player(self):
        player = make_player()
        self.client.force_login(player.user)
        self.assertEqual(
            self.client.get('/api/auth/me/').json(),
            {
                'login_enabled': True,
                'user': {
                    'discord_id': '80351110224678912',
                    'name': 'Nelly',
                    'avatar_url': 'https://cdn.discordapp.com/embed/avatars/5.png',
                    'is_staff': False,
                },
            },
        )

    def test_account_page_is_not_in_the_sitemap(self):
        self.assertNotIn('ucet', self.client.get('/sitemap.xml').content.decode())

    @override_settings(**DISCORD)
    def test_admin_without_discord_is_not_a_site_account(self):
        self.client.force_login(User.objects.create_superuser('boss', password='x'))
        self.assertEqual(self.client.get('/api/auth/me/').json(), {'login_enabled': True, 'user': None})


class SessionActionTests(TestCase):
    def setUp(self):
        self.client = Client(enforce_csrf_checks=True)

    def sign_in(self, **kwargs):
        player = make_player(**kwargs)
        self.client.force_login(player.user)
        return self.client.get('/api/auth/me/').cookies['csrftoken'].value

    def test_logout_needs_csrf_token(self):
        token = self.sign_in()
        self.assertEqual(self.client.post('/api/auth/logout/').status_code, 403)
        self.assertIn('_auth_user_id', self.client.session)
        self.assertEqual(self.client.post('/api/auth/logout/', HTTP_X_CSRFTOKEN=token).status_code, 204)
        self.assertNotIn('_auth_user_id', self.client.session)
        self.assertIsNone(self.client.get('/api/auth/me/').json()['user'])

    def test_player_deletes_own_account(self):
        token = self.sign_in()
        self.assertEqual(self.client.delete('/api/auth/me/').status_code, 403)  # no CSRF token
        self.assertEqual(self.client.delete('/api/auth/me/', HTTP_X_CSRFTOKEN=token).status_code, 204)
        self.assertFalse(User.objects.exists())
        self.assertFalse(Player.objects.exists())
        self.assertNotIn('_auth_user_id', self.client.session)

    def test_staff_and_superusers_cannot_delete_themselves(self):
        for flags in ({'is_staff': True}, {'is_superuser': True}):
            with self.subTest(**flags):
                User.objects.all().delete()
                token = self.sign_in(**flags)
                self.assertEqual(self.client.delete('/api/auth/me/', HTTP_X_CSRFTOKEN=token).status_code, 403)
                self.assertTrue(Player.objects.exists())

    def test_anonymous_cannot_delete(self):
        token = self.client.get('/api/auth/me/').cookies['csrftoken'].value
        self.assertEqual(self.client.delete('/api/auth/me/', HTTP_X_CSRFTOKEN=token).status_code, 403)


@override_settings(STORAGES=PLAIN_STATIC)
class PlayerAdminTests(TestCase):
    url = '/admin/accounts/player/'

    def setUp(self):
        self.player = make_player()
        self.admin = User.objects.create_superuser('boss', password='x')

    def test_superuser_only_and_search(self):
        self.client.force_login(User.objects.create_user('r4', password='x', is_staff=True))
        self.assertEqual(self.client.get(self.url).status_code, 403)
        self.client.force_login(self.admin)
        response = self.client.get(self.url, {'q': '80351110224678912'})
        self.assertContains(response, 'Nelly')
        self.assertContains(response, 'https://cdn.discordapp.com/embed/avatars/5.png')
        self.assertEqual(self.client.get(f'{self.url}add/').status_code, 403)

    def test_deleting_a_player_removes_the_user(self):
        self.client.force_login(self.admin)
        response = self.client.post(f'{self.url}{self.player.pk}/delete/', {'post': 'yes'})
        self.assertEqual(response.status_code, 302)
        self.assertEqual(list(User.objects.values_list('username', flat=True)), ['boss'])


def make_governor(player, governor_id='12345678', **kwargs):
    return Governor.objects.create(player=player, governor_id=governor_id, name=kwargs.pop('name', 'Nelly'), **kwargs)


class GovernorApiTests(TestCase):
    url = '/api/me/governors/'

    def setUp(self):
        cache.clear()  # registration throttle
        self.player = make_player()
        self.alliance = Alliance.objects.get(tag='CS35')  # seeded by migration
        self.client.force_login(self.player.user)

    def post(self, **data):
        return self.client.post(
            self.url, {'governor_id': '12345678', 'name': 'Nelly', **data}, content_type='application/json'
        )

    def test_create_and_list_own(self):
        response = self.post(name='  Nelly 1035 ', kind='farm', alliance=self.alliance.pk)
        self.assertEqual(response.status_code, 201)
        governor = Governor.objects.get()
        self.assertEqual(
            (governor.player, governor.governor_id, governor.name, governor.kind, governor.alliance),
            (self.player, '12345678', 'Nelly 1035', 'farm', self.alliance),
        )
        self.assertEqual(governor.status, Governor.Status.PENDING)
        self.assertIsNone(governor.reviewed_by)
        data = response.json()
        self.assertEqual(
            {k: v for k, v in data.items() if k != 'created_at'},
            {
                'id': governor.pk,
                'governor_id': '12345678',
                'name': 'Nelly 1035',
                'kind': 'farm',
                'alliance': {'id': self.alliance.pk, 'tag': 'CS35'},
                'status': 'pending',
                'review_note': '',
            },
        )
        listing = self.client.get(self.url)
        self.assertEqual(listing.json(), [data])
        self.assertIn('no-store', listing['Cache-Control'])

    def test_defaults_to_main_account_without_alliance(self):
        data = self.post(governor_id=12345678).json()  # a JSON number works too
        self.assertEqual((data['governor_id'], data['kind'], data['alliance']), ('12345678', 'main', None))

    def test_waiting_entries_come_first(self):
        approved = make_governor(self.player, '10000001', status=Governor.Status.APPROVED)
        pending = make_governor(self.player, '10000002')
        newest = make_governor(self.player, '10000003', status=Governor.Status.REJECTED)
        self.assertEqual([g['id'] for g in self.client.get(self.url).json()], [pending.pk, newest.pk, approved.pk])

    def test_rejected_entry_shows_the_note(self):
        make_governor(self.player, status=Governor.Status.REJECTED, review_note='Meno v hre nesedí.')
        self.assertEqual(self.client.get(self.url).json()[0]['review_note'], 'Meno v hre nesedí.')

    def test_cannot_see_or_delete_other_players_entries(self):
        other = make_governor(make_player('90351110224678912'), '87654321')
        mine = make_governor(self.player)
        self.assertEqual([g['id'] for g in self.client.get(self.url).json()], [mine.pk])
        self.assertEqual(self.client.delete(f'{self.url}{other.pk}/').status_code, 404)
        self.assertTrue(Governor.objects.filter(pk=other.pk).exists())
        self.assertEqual(self.client.delete(f'{self.url}{mine.pk}/').status_code, 204)
        self.assertEqual(list(Governor.objects.all()), [other])

    def test_own_entry_can_be_deleted_in_any_state(self):
        for i, status in enumerate(Governor.Status.values):
            governor = make_governor(self.player, f'2000000{i}', status=status)
            self.assertEqual(self.client.delete(f'{self.url}{governor.pk}/').status_code, 204)
        self.assertFalse(Governor.objects.exists())

    def test_anonymous_and_password_admins_are_refused(self):
        governor = make_governor(self.player)
        for user in (None, User.objects.create_superuser('boss', password='x')):
            with self.subTest(user=user):
                self.client.logout()
                if user:
                    self.client.force_login(user)  # signed in with a password: no player profile
                self.assertEqual(self.client.get(self.url).status_code, 403)
                self.assertEqual(self.post(governor_id='87654321').status_code, 403)
                self.assertEqual(self.client.delete(f'{self.url}{governor.pk}/').status_code, 403)
        self.assertEqual(list(Governor.objects.values_list('governor_id', flat=True)), ['12345678'])

    def test_invalid_input_has_a_code(self):
        inactive = Alliance.objects.create(tag='OFF', name='Hidden', is_active=False)
        cases = [
            ({'governor_id': '12345'}, 'invalid_id'),
            ({'governor_id': '1234567890123'}, 'invalid_id'),
            ({'governor_id': '1234 5678'}, 'invalid_id'),
            ({'governor_id': '١٢٣٤٥٦٧٨'}, 'invalid_id'),  # not 0–9
            ({'governor_id': ''}, 'invalid_id'),
            ({'governor_id': None}, 'invalid_id'),
            ({'name': '   '}, 'invalid_name'),
            ({'name': 'x' * 33}, 'invalid_name'),
            ({'kind': 'alt'}, 'invalid'),
            ({'alliance': 999}, 'invalid'),
            ({'alliance': inactive.pk}, 'invalid'),
        ]
        for data, code in cases:
            with self.subTest(**data):
                cache.clear()
                response = self.post(**data)
                self.assertEqual((response.status_code, response.json()), (400, {'code': code}))
        self.assertFalse(Governor.objects.exists())

    def test_pending_or_approved_id_is_taken_but_rejected_can_be_resubmitted(self):
        other = make_player('90351110224678912')
        for status in (Governor.Status.PENDING, Governor.Status.APPROVED):
            with self.subTest(status=status):
                Governor.objects.all().delete()
                make_governor(other, status=status)
                response = self.post()
                self.assertEqual((response.status_code, response.json()), (400, {'code': 'taken'}))
        Governor.objects.update(status=Governor.Status.REJECTED)
        self.assertEqual(self.post().status_code, 201)
        self.assertEqual(Governor.objects.filter(governor_id='12345678').count(), 2)
        # the player's own waiting entry counts as well
        self.assertEqual(self.post().json(), {'code': 'taken'})

    def test_at_most_five_per_player(self):
        # rejected entries count too – the player deletes them to make room
        make_governor(self.player, '10000000', status=Governor.Status.REJECTED)
        for i in range(1, MAX_GOVERNORS - 1):
            make_governor(self.player, f'1000000{i}')
        self.assertEqual(self.post(governor_id='20000001').status_code, 201)
        response = self.post(governor_id='20000002')
        self.assertEqual((response.status_code, response.json()), (400, {'code': 'limit'}))
        self.assertEqual(self.player.governors.count(), MAX_GOVERNORS)
        # another player has their own limit
        self.client.force_login(make_player('90351110224678912').user)
        self.assertEqual(self.post(governor_id='20000002').status_code, 201)

    def test_only_new_registrations_are_throttled(self):
        mine = make_governor(self.player, '87654321')
        for _ in range(11):  # the list loads on every visit of /ucet
            self.assertEqual(self.client.get(self.url).status_code, 200)
        for _ in range(10):
            self.assertEqual(self.post(governor_id='1').status_code, 400)
        self.assertEqual(self.post().status_code, 429)
        self.assertFalse(Governor.objects.filter(governor_id='12345678').exists())
        self.assertEqual(self.client.get(self.url).status_code, 200)
        self.assertEqual(self.client.delete(f'{self.url}{mine.pk}/').status_code, 204)
        # per player, not for the whole site
        self.client.force_login(make_player('90351110224678912').user)
        self.assertEqual(self.post().status_code, 201)

    def test_csrf_token_is_required(self):
        client = Client(enforce_csrf_checks=True)
        client.force_login(self.player.user)
        token = client.get('/api/auth/me/').cookies['csrftoken'].value
        body = {'governor_id': '12345678', 'name': 'Nelly'}
        self.assertEqual(client.post(self.url, body, content_type='application/json').status_code, 403)
        response = client.post(self.url, body, content_type='application/json', HTTP_X_CSRFTOKEN=token)
        self.assertEqual(response.status_code, 201)
        detail = f'{self.url}{response.json()["id"]}/'
        self.assertEqual(client.delete(detail).status_code, 403)
        self.assertEqual(client.delete(detail, HTTP_X_CSRFTOKEN=token).status_code, 204)

    def test_deleting_the_account_removes_the_registrations(self):
        make_governor(self.player)
        self.assertEqual(self.client.delete('/api/auth/me/').status_code, 204)
        self.assertFalse(Governor.objects.exists())


class GovernorModelTests(TestCase):
    def setUp(self):
        self.player = make_player()

    def test_one_active_claim_per_governor_id(self):
        make_governor(self.player, status=Governor.Status.REJECTED)
        make_governor(self.player, status=Governor.Status.REJECTED)
        make_governor(self.player)
        with self.assertRaises(IntegrityError), transaction.atomic():
            make_governor(self.player, status=Governor.Status.APPROVED)

    def test_clean_refuses_reactivating_a_claimed_id(self):
        rejected = make_governor(self.player, status=Governor.Status.REJECTED)
        make_governor(make_player('90351110224678912'))
        rejected.status = Governor.Status.APPROVED
        with self.assertRaises(ValidationError):
            rejected.clean()
        rejected.status = Governor.Status.REJECTED
        rejected.clean()

    def test_governor_id_validator(self):
        with self.assertRaises(ValidationError) as ctx:
            Governor(player=self.player, governor_id='12345', name='Nelly').full_clean()
        self.assertIn('governor_id', ctx.exception.message_dict)


@override_settings(STORAGES=PLAIN_STATIC)
class GovernorAdminTests(TestCase):
    url = '/admin/accounts/governor/'

    def setUp(self):
        self.player = make_player()
        self.pending = make_governor(self.player, '12345678', name='Nelly Farm', kind=Governor.Kind.FARM)
        self.approved = make_governor(
            make_player('90351110224678912'),
            '87654321',
            name='Kubo',
            status=Governor.Status.APPROVED,
            alliance=Alliance.objects.get(tag='CS35'),
        )

    def r4(self):
        """A player made R4 in the Users admin: staff + group R4."""
        user = User.objects.create_user('discord_555', is_staff=True)
        user.groups.add(Group.objects.get(name='R4'))
        self.client.force_login(user)
        return user

    def act(self, action, *governors):
        return self.client.post(self.url, {'action': action, '_selected_action': [g.pk for g in governors]})

    def test_r4_group_gets_only_the_governor_permissions(self):
        # this test database was migrated from scratch: the data migration had to create the permissions itself
        # (post_migrate creates them only after all migrations)
        permissions = Group.objects.get(name='R4').permissions.values_list('content_type__app_label', 'codename')
        self.assertEqual(sorted(permissions), [('accounts', 'change_governor'), ('accounts', 'view_governor')])

    def test_r4_filters_and_approves(self):
        r4 = self.r4()
        response = self.client.get(self.url, {'status__exact': 'pending'})
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Nelly Farm')
        self.assertNotContains(response, 'Kubo')
        self.assertContains(response, 'https://discord.com/users/80351110224678912')
        self.assertContains(response, 'over v hre meno a Governor ID')
        actions = response.context['cl'].model_admin.get_actions(response.wsgi_request)
        self.assertEqual(list(actions), ['approve', 'reject'])  # no "delete selected"

        response = self.act('approve', self.pending)
        self.assertEqual(response.status_code, 302)
        self.pending.refresh_from_db()
        self.assertEqual((self.pending.status, self.pending.reviewed_by), (Governor.Status.APPROVED, r4))
        self.assertIsNotNone(self.pending.reviewed_at)

        # the change form links nowhere R4 cannot go
        response = self.client.get(f'{self.url}{self.approved.pk}/change/')
        self.assertContains(response, '@nelly')
        self.assertContains(response, '[CS35]')
        self.assertContains(response, 'name="status"')
        for forbidden in ('/admin/accounts/player/', '/admin/kingdom/', '/admin/auth/'):
            self.assertNotContains(response, forbidden)

        # nothing else: no players, no adding, no deleting
        self.assertEqual(self.client.get('/admin/accounts/player/').status_code, 403)
        self.assertEqual(self.client.get(f'{self.url}add/').status_code, 403)
        self.assertEqual(self.client.post(f'{self.url}{self.pending.pk}/delete/', {'post': 'yes'}).status_code, 403)
        self.assertEqual(Governor.objects.count(), 2)

    def test_staff_without_the_group_sees_nothing(self):
        self.client.force_login(User.objects.create_user('staff', password='x', is_staff=True))
        self.assertEqual(self.client.get(self.url).status_code, 403)

    def test_reject_and_change_form_stamp_the_review(self):
        boss = User.objects.create_superuser('boss', password='x')
        self.client.force_login(boss)
        self.act('reject', self.pending, self.approved)
        self.assertEqual(set(Governor.objects.values_list('status', 'reviewed_by')), {('rejected', boss.pk)})

        self.pending.refresh_from_db()
        stamped = self.pending.reviewed_at
        change = f'{self.url}{self.pending.pk}/change/'
        # only the note changed → still the same review
        self.client.post(change, {'status': 'rejected', 'review_note': 'Pošli R4 screenshot profilu.'})
        self.pending.refresh_from_db()
        self.assertEqual((self.pending.review_note, self.pending.reviewed_at), ('Pošli R4 screenshot profilu.', stamped))

        r4 = self.r4()
        response = self.client.post(change, {'status': 'approved', 'review_note': 'Vitaj!'})
        self.assertEqual(response.status_code, 302)
        self.pending.refresh_from_db()
        self.assertEqual((self.pending.status, self.pending.review_note), ('approved', 'Vitaj!'))
        self.assertEqual(self.pending.reviewed_by, r4)
        self.assertGreater(self.pending.reviewed_at, stamped)
        # what the player entered is read-only
        self.assertEqual((self.pending.name, self.pending.governor_id), ('Nelly Farm', '12345678'))

    def test_bulk_approve_clears_an_old_note(self):
        Governor.objects.filter(pk=self.pending.pk).update(status='rejected', review_note='Nesedí meno.')
        self.client.force_login(User.objects.create_superuser('boss', password='x'))
        self.act('approve', self.pending)
        self.pending.refresh_from_db()
        self.assertEqual((self.pending.status, self.pending.review_note), ('approved', ''))

    def test_a_claimed_id_cannot_be_turned_back_on(self):
        rejected = make_governor(self.player, '87654321', status=Governor.Status.REJECTED)  # Kubo has it
        self.client.force_login(User.objects.create_superuser('boss', password='x'))
        response = self.act('approve', rejected, self.pending)
        self.assertEqual(response.status_code, 302)
        rejected.refresh_from_db()
        self.pending.refresh_from_db()
        self.assertEqual((rejected.status, self.pending.status), ('rejected', 'approved'))
        messages = [str(m) for m in response.wsgi_request._messages]
        self.assertIn('Schválené: 1', messages)
        self.assertTrue(any('Nezmenené' in m and '87654321' in m for m in messages))

        response = self.client.post(f'{self.url}{rejected.pk}/change/', {'status': 'pending', 'review_note': ''})
        self.assertEqual(response.status_code, 200)  # the form with an error, not an IntegrityError
        self.assertContains(response, 'už má iný záznam')
        rejected.refresh_from_db()
        self.assertEqual(rejected.status, 'rejected')


class SnapshotPrivacyTests(TransactionTestCase):
    serialized_rollback = True  # starts with the content seeded by migrations, like a real database

    def test_export_contains_no_players(self):
        admin = User.objects.create_superuser('boss', password='x')
        kept = User.objects.create_user('discordX')  # no underscore → not a Discord account
        player = make_player()
        group = Group.objects.get(name='R4')  # seeded by migration
        player.user.groups.add(group)
        kept.groups.add(group)
        governor = make_governor(player, '24681357', name='Zlatovlaska', reviewed_by=admin)
        # about a player, a governor, a Discord user, by a Discord user (R4) → removed; about discordX → kept
        logged = ((admin, player), (admin, governor), (admin, player.user), (player.user, kept), (admin, kept))
        for actor, obj in logged:
            LogEntry.objects.log_actions(user_id=actor.pk, queryset=[obj], action_flag=ADDITION, single_object=True)

        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            path = folder / 'db.sqlite3'
            with override_settings(SNAPSHOT_PATH=path, SNAPSHOT_BASE_PATH=folder / 'base'):
                self.assertTrue(snapshot.export_snapshot())
                conn = sqlite3.connect(path)
                try:
                    count = lambda sql: conn.execute(sql).fetchone()[0]  # noqa: E731
                    self.assertEqual(count('SELECT COUNT(*) FROM accounts_player'), 0)
                    self.assertEqual(count('SELECT COUNT(*) FROM accounts_governor'), 0)
                    # the group itself is site configuration and stays
                    self.assertEqual(count("SELECT COUNT(*) FROM auth_group WHERE name = 'R4'"), 1)
                    self.assertEqual(
                        [r[0] for r in conn.execute('SELECT username FROM auth_user ORDER BY username')],
                        ['boss', 'discordX'],
                    )
                    self.assertEqual(count('SELECT COUNT(*) FROM auth_user_groups'), 1)
                    log = conn.execute('SELECT user_id, object_id FROM django_admin_log').fetchall()
                    self.assertEqual(log, [(admin.pk, str(kept.pk))])
                    dump = '\n'.join(conn.iterdump())
                finally:
                    conn.close()
                self.assertNotIn('80351110224678912', dump)
                self.assertNotIn('Nelly', dump)
                self.assertNotIn('24681357', dump)
                self.assertNotIn('Zlatovlaska', dump)

                # another local sign-in or registration does not change the committed file
                make_governor(make_player('90351110224678912'), '13572468')
                self.assertFalse(snapshot.export_snapshot())

        # the live database keeps its players
        self.assertEqual(Player.objects.count(), 2)

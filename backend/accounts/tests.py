import io
import json
import sqlite3
import tempfile
import urllib.error
from datetime import timedelta
from pathlib import Path
from unittest import mock
from urllib.parse import parse_qs, urlsplit

from django.conf import settings
from django.contrib.admin.models import ADDITION, CHANGE, LogEntry
from django.contrib.auth.models import Group, User
from django.core.cache import cache
from django.core.management import CommandError, call_command
from django.test import Client, TestCase, TransactionTestCase, override_settings
from django.utils import timezone

from kingdom import snapshot
from kingdom.models import KingdomEvent

from . import discord_oauth
from .models import EventReminder, Player, SentReminder

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


def make_player(discord_id='80351110224678912', ingame_name='', **kwargs):
    user = User.objects.create_user(f'discord_{discord_id}', **kwargs)
    return Player.objects.create(
        user=user, discord_id=discord_id, username='nelly', global_name='Nelly', ingame_name=ingame_name
    )


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

    @override_settings(DISCORD_ADMIN_IDS=['80351110224678912'])
    def test_admin_ids_sign_in_as_superusers(self):
        self.callback(state=self.start(), code='abc')
        user = User.objects.get()
        self.assertTrue(user.is_staff and user.is_superuser)
        self.assertFalse(user.has_usable_password())
        self.assertTrue(self.client.get('/api/auth/me/').json()['user']['is_staff'])

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
                    'ingame_name': '',
                    'is_staff': False,
                    'is_superuser': False,
                },
            },
        )

    def test_account_page_is_not_in_the_sitemap(self):
        self.assertNotIn('ucet', self.client.get('/sitemap.xml').content.decode())

    @override_settings(**DISCORD)
    def test_admin_without_discord_is_not_a_site_account(self):
        self.client.force_login(User.objects.create_superuser('boss', password='x'))
        self.assertEqual(self.client.get('/api/auth/me/').json(), {'login_enabled': True, 'user': None})


@override_settings(**DISCORD, DEBUG=True)
class TestSessionCommandTests(TestCase):
    def session(self, *args):
        out = io.StringIO()
        call_command('test_session', *args, stdout=out, stderr=io.StringIO())
        return out.getvalue().strip()

    def me(self, key):
        self.client.cookies['sessionid'] = key
        return self.client.get('/api/auth/me/').json()['user']

    def test_signs_in_a_test_player_and_deletes_it(self):
        first = self.session()
        self.assertEqual(self.me(first)['discord_id'], '999000111')
        self.assertFalse(self.me(first)['is_superuser'])

        # again as superuser: the same player, the older session is gone
        second = self.session('--superuser')
        self.assertIsNone(self.me(first))
        self.assertTrue(self.me(second)['is_superuser'])
        self.assertEqual(Player.objects.count(), 1)

        self.session('--delete')
        self.assertIsNone(self.me(second))
        self.assertFalse(User.objects.filter(username='discord_999000111').exists())

    @override_settings(DEBUG=False)
    def test_refused_outside_development(self):
        with self.assertRaises(CommandError):
            self.session()
        self.assertFalse(Player.objects.exists())


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

    def test_deleting_the_account_forgets_the_admin_history_about_the_player(self):
        token = self.sign_in()
        player = Player.objects.get()
        admin = User.objects.create_superuser('boss', password='x')
        event = KingdomEvent.objects.create(name_sk='MGE', starts_at=timezone.now() + timedelta(days=1))
        reminder = EventReminder.objects.create(player=player, event=event, offsets=[60])
        sent = SentReminder.objects.create(
            player=player, event=event, occurrence=event.starts_at, offset=60, channel='discord'
        )
        for obj in (player.user, player, reminder, sent, event):
            LogEntry.objects.log_actions(admin.pk, [obj], CHANGE, change_message='edited')

        self.assertEqual(self.client.delete('/api/auth/me/', HTTP_X_CSRFTOKEN=token).status_code, 204)
        # only the entry about the event (no player data) stays
        self.assertEqual(list(LogEntry.objects.values_list('object_repr', flat=True)), [str(event)])
        self.assertEqual(list(User.objects.values_list('username', flat=True)), ['boss'])
        self.assertFalse(EventReminder.objects.exists())
        self.assertFalse(SentReminder.objects.exists())

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


class IngameNameTests(TestCase):
    def setUp(self):
        self.client = Client(enforce_csrf_checks=True)

    def patch(self, data, token=None):
        headers = {'HTTP_X_CSRFTOKEN': token} if token else {}
        return self.client.patch('/api/auth/me/', json.dumps(data), content_type='application/json', **headers)

    def token(self):
        return self.client.get('/api/auth/me/').cookies['csrftoken'].value

    def test_player_saves_and_clears_the_name(self):
        player = make_player()
        self.client.force_login(player.user)
        token = self.token()
        self.assertEqual(self.patch({'ingame_name': 'GetheR'}).status_code, 403)  # no CSRF token
        response = self.patch({'ingame_name': '  GetheR  '}, token)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['user']['ingame_name'], 'GetheR')
        player.refresh_from_db()
        self.assertEqual(player.ingame_name, 'GetheR')
        self.assertEqual(self.patch({'ingame_name': ''}, token).json()['user']['ingame_name'], '')

    def test_name_is_at_most_32_characters(self):
        player = make_player()
        self.client.force_login(player.user)
        response = self.patch({'ingame_name': 'x' * 33}, self.token())
        self.assertEqual(response.status_code, 400)
        self.assertIn('ingame_name', response.json())

    def test_other_fields_are_ignored(self):
        player = make_player()
        self.client.force_login(player.user)
        self.patch({'discord_id': '1', 'username': 'hacker', 'ingame_name': 'Ok'}, self.token())
        player.refresh_from_db()
        self.assertEqual((player.discord_id, player.username, player.ingame_name), ('80351110224678912', 'nelly', 'Ok'))

    def test_anonymous_and_password_admins_are_refused(self):
        self.assertEqual(self.patch({'ingame_name': 'X'}, self.token()).status_code, 403)
        self.client.force_login(User.objects.create_superuser('boss', password='x'))
        self.assertEqual(self.patch({'ingame_name': 'X'}, self.token()).status_code, 403)


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
        Player.objects.filter(pk=self.player.pk).update(ingame_name='GetheR')
        self.assertContains(self.client.get(self.url, {'q': 'gether'}), 'Nelly')
        self.assertContains(response, 'https://cdn.discordapp.com/embed/avatars/5.png')
        self.assertEqual(self.client.get(f'{self.url}add/').status_code, 403)

    def test_deleting_a_player_removes_the_user(self):
        self.client.force_login(self.admin)
        response = self.client.post(f'{self.url}{self.player.pk}/delete/', {'post': 'yes'})
        self.assertEqual(response.status_code, 302)
        self.assertEqual(list(User.objects.values_list('username', flat=True)), ['boss'])
        # not even the deletion entry with the player's name stays in the admin history
        self.assertFalse(LogEntry.objects.exists())

    def test_bulk_delete_action_removes_the_users_and_their_history(self):
        other = make_player(discord_id='245662824171438090')
        self.client.force_login(self.admin)
        response = self.client.post(
            self.url, {'action': 'delete_selected', '_selected_action': [self.player.pk, other.pk], 'post': 'yes'}
        )
        self.assertEqual(response.status_code, 302)
        self.assertEqual(list(User.objects.values_list('username', flat=True)), ['boss'])
        self.assertFalse(LogEntry.objects.exists())


    def test_users_list_shows_and_finds_the_in_game_name(self):
        Player.objects.filter(pk=self.player.pk).update(ingame_name='GetheR')
        self.client.force_login(self.admin)
        response = self.client.get('/admin/auth/user/')
        self.assertContains(response, 'GetheR')
        self.assertContains(self.client.get('/admin/auth/user/', {'q': 'gether'}), 'discord_80351110224678912')

class SnapshotPrivacyTests(TransactionTestCase):
    serialized_rollback = True  # starts with the content seeded by migrations, like a real database

    def test_export_contains_no_players(self):
        admin = User.objects.create_superuser('boss', password='x')
        kept = User.objects.create_user('discordX')  # no underscore → not a Discord account
        player = make_player(ingame_name='Zlatovlaska')
        group = Group.objects.create(name='Leaders')
        player.user.groups.add(group)
        kept.groups.add(group)
        # about a player, a Discord user, by a Discord user → removed; about discordX → kept
        logged = ((admin, player), (admin, player.user), (player.user, kept), (admin, kept))
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
                    # the group itself is site configuration and stays
                    self.assertEqual(count("SELECT COUNT(*) FROM auth_group WHERE name = 'Leaders'"), 1)
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
                self.assertNotIn('Zlatovlaska', dump)

                # another local sign-in does not change the committed file
                make_player('90351110224678912', ingame_name='Popoluska')
                self.assertFalse(snapshot.export_snapshot())

        # the live database keeps its players
        self.assertEqual(Player.objects.count(), 2)

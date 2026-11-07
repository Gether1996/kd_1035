"""Who may call which endpoint of the API – one table for every endpoint and every role (Gether 2. 11. 2026: "kontrola
backendu a oprávnení"; v1.56.2 was a permission bug – players without Discord could not send the KvK sign-up).

DRF lets everyone in by default (AllowAny in config/settings.py), so access hangs on the checks of each view. MATRIX
says what every role gets from every method of every endpoint – status codes only, the bodies are the features' own
tests. A new endpoint under /api/ needs a row here or a place in PUBLIC, else test_every_endpoint_is_in_the_matrix
names it.

Bodies are empty or invalid wherever that is enough: a role that gets through the permission check gets 400/404 from
the view, the others 403 (session auth answers an anonymous visitor 403 too). Every call runs in its own savepoint
that is rolled back, with the role's session cookie put back and the throttles reset, so the rows do not change each
other.
"""

import shutil
import tempfile
from types import SimpleNamespace

from django.conf import settings
from django.contrib.auth.models import User
from django.core.cache import cache
from django.db import transaction
from django.test import Client, TestCase, override_settings
from django.urls import URLResolver, get_resolver, resolve

from kingdom.models import KingdomEvent

from . import guard
from .models import TERMS_VERSION, ForumPost, ForumThread, HallEntry, KvkSignup, March, Player
from .test_kvk import STATS
from .test_reminders import make_player, utc

ADMIN_ID = '80351110224678999'

# anon     – not signed in
# d_wait   – Discord, waits for the approval (terms accepted)
# d_ok     – Discord, approved, terms accepted
# d_terms  – Discord, approved, the current terms not accepted yet
# l_wait   – without Discord (in-game name + password), waits for the approval
# l_ok     – without Discord, approved, terms accepted
# r4       – Discord, approved, R4 (Player.kvk_reviewer)
# eval     – Discord, approved, "Vyh. nastavenia" (Player.evaluation_settings)
# revoked  – Discord, R4 and "Vyh. nastavenia", but the approval taken back
# forged   – Discord, approved, is_superuser + is_staff set in the database without signing in as the admin (guard.py)
# super    – the superadmin: Discord ID from DISCORD_ADMIN_IDS, signed in as the admin (guard.py)
ROLES = ('anon', 'd_wait', 'd_ok', 'd_terms', 'l_wait', 'l_ok', 'r4', 'eval', 'revoked', 'forged', 'super')

SIGNUP = {
    'ingame_name': 'Nelly',
    'role': 'rally',
    'kind': 'cavalry',
    'primary': 'Attila',
    'budget': 'to100',
    'online': ['evenings'],
}
MARCH = {'kind': 'cavalry', 'primary': 'Attila', **STATS}
FORUM = {'title': 'Kto ide na rally?', 'body': 'Ahoj', 'website': '', 'elapsed': 5000}

# {name} in a path = an object of setUpTestData (self.ids)
# fmt: off
MATRIX = [
    # method   path                                         body     anon d_wait d_ok d_terms l_wait l_ok r4 eval revoked forged super
    # -------- the own account
    ('GET',    '/api/auth/me/',                             None,    '200 200 200 200 200 200 200 200 200 200 200'),
    ('PATCH',  '/api/auth/me/',                             {},      '403 200 200 200 200 200 200 200 200 200 200'),
    # leadership accounts are deleted in the admin only; a forged superuser is a plain player
    ('DELETE', '/api/auth/me/',                             None,    '403 204 204 204 204 204 204 204 204 204 403'),
    ('POST',   '/api/auth/logout/',                         None,    '204 204 204 204 204 204 204 204 204 204 204'),
    ('POST',   '/api/auth/terms/',                          None,    '403 200 200 200 200 200 200 200 200 200 200'),
    # players without Discord only
    ('POST',   '/api/auth/local/password/',                 {},      '403 403 403 403 400 400 403 403 403 403 403'),
    # -------- reminders and alarms: Discord players only (the bot writes them; any approval)
    ('GET',    '/api/me/reminders/',                        None,    '403 200 200 200 403 403 200 200 200 200 200'),
    ('PATCH',  '/api/me/reminders/',                        {},      '403 200 200 200 403 403 200 200 200 200 200'),
    ('POST',   '/api/me/reminders/test/',                   None,    '403 200 200 200 403 403 200 200 200 200 200'),
    ('PUT',    '/api/me/reminders/{event}/',                {},      '403 400 400 400 403 403 400 400 400 400 400'),
    ('DELETE', '/api/me/reminders/{event}/',                None,    '403 204 204 204 403 403 204 204 204 204 204'),
    ('GET',    '/api/me/alarms/',                           None,    '403 200 200 200 403 403 200 200 200 200 200'),
    ('POST',   '/api/me/alarms/',                           {},      '403 400 400 400 403 403 400 400 400 400 400'),
    ('DELETE', '/api/me/alarms/0/',                         None,    '403 404 404 404 403 403 404 404 404 404 404'),
    # -------- KvK sign-ups: approved players with and without Discord; sending one needs the terms
    ('GET',    '/api/kvk/',                                 None,    '200 200 200 200 200 200 200 200 200 200 200'),
    ('PUT',    '/api/kvk/signup/',                          SIGNUP,  '403 403 200 403 403 200 200 200 403 200 200'),
    # d_ok has a rally sign-up, the others none
    ('PATCH',  '/api/kvk/signup/',                          {'role': 'rally'},
                                                                     '403 403 200 403 403 404 404 404 403 404 404'),
    ('DELETE', '/api/kvk/signup/?role=rally',               None,    '403 403 204 204 403 204 204 204 403 204 204'),
    ('GET',    '/api/kvk/signups/',                         None,    '403 403 403 403 403 403 200 403 403 403 200'),
    ('DELETE', '/api/kvk/signups/{signup}/',                None,    '403 403 403 403 403 403 403 403 403 403 204'),
    # -------- players (/hraci): the superadmin only
    ('GET',    '/api/kvk/reviewers/',                       None,    '403 403 403 403 403 403 403 403 403 403 200'),
    ('PATCH',  '/api/kvk/reviewers/{player}/',              {},      '403 403 403 403 403 403 403 403 403 403 400'),
    ('PUT',    '/api/kvk/reviewers/auto-approve/',          {},      '403 403 403 403 403 403 403 403 403 403 400'),
    ('POST',   '/api/kvk/reviewers/{local}/reset-code/',    None,    '403 403 403 403 403 403 403 403 403 403 200'),
    ('DELETE', '/api/kvk/reviewers/{waiting_local}/delete/', None,   '403 403 403 403 403 403 403 403 403 403 204'),
    # -------- marches: approved players with and without Discord; adding and changing one needs the terms
    ('GET',    '/api/me/marches/',                          None,    '403 403 200 200 403 200 200 200 403 200 200'),
    ('POST',   '/api/me/marches/',                          MARCH,   '403 403 201 403 403 201 201 201 403 201 201'),
    ('PATCH',  '/api/me/marches/',                          {},      '403 403 400 400 403 400 400 400 403 400 400'),
    ('PUT',    '/api/me/marches/order/',                    {},      '403 403 400 400 403 400 400 400 403 400 400'),
    ('PATCH',  '/api/me/marches/0/',                        {},      '403 403 404 404 403 404 404 404 403 404 404'),
    ('DELETE', '/api/me/marches/0/',                        None,    '403 403 404 404 403 404 404 404 403 404 404'),
    # d_ok's march: nobody else changes or deletes it, not even the superadmin
    ('PATCH',  '/api/me/marches/{march}/',                  {},      '403 403 200 404 403 404 404 404 403 404 404'),
    ('DELETE', '/api/me/marches/{march}/',                  None,    '403 403 204 404 403 404 404 404 403 404 404'),
    ('GET',    '/api/marches/',                             None,    '403 403 200 200 403 200 200 200 403 200 200'),
    ('GET',    '/api/marches/notices/',                     None,    '403 403 403 403 403 403 403 403 403 403 200'),
    ('POST',   '/api/marches/notices/',                     {},      '403 403 403 403 403 403 403 403 403 403 400'),
    # -------- KvK evaluation (/vyhodnocovanie)
    ('GET',    '/api/evaluation/',                          None,    '403 403 403 403 403 403 403 200 403 403 200'),
    # {} would put the defaults back – a wrong type is enough
    ('PUT',    '/api/evaluation/settings/',                 {'settings': 'x'},
                                                                     '403 403 403 403 403 403 403 400 403 403 400'),
    ('PATCH',  '/api/evaluation/players/',                  {},      '403 403 403 403 403 403 403 400 403 403 400'),
    ('PATCH',  '/api/evaluation/players/{player}/',         {},      '403 403 403 403 403 403 403 400 403 403 400'),
    # the published required acclaim: every approved player; publishing it: the evaluators
    ('GET',    '/api/evaluation/overview/',                 None,    '403 403 200 200 403 200 200 200 403 200 200'),
    ('PUT',    '/api/evaluation/overview/',                 {},      '403 403 403 403 403 403 403 400 403 403 400'),
    ('GET',    '/api/evaluation/equipment/',                None,    '403 403 403 403 403 403 200 403 403 403 200'),
    ('GET',    '/api/evaluation/changes/',                  None,    '403 403 403 403 403 403 403 403 403 403 200'),
    # -------- Hall of Fame: approved players see it, the superadmin edits it
    ('GET',    '/api/hall/',                                None,    '403 403 200 200 403 200 200 200 403 200 200'),
    ('GET',    '/api/hall/photos/{entry}/',                 None,    '403 403 404 404 403 404 404 404 403 404 404'),
    ('PUT',    '/api/hall/forts/',                          {},      '403 403 403 403 403 403 403 403 403 403 400'),
    ('PUT',    '/api/hall/forts/1/',                        {},      '403 403 403 403 403 403 403 403 403 403 400'),
    ('DELETE', '/api/hall/forts/1/',                        None,    '403 403 403 403 403 403 403 403 403 403 204'),
    ('POST',   '/api/hall/forts/1/photo/',                  {},      '403 403 403 403 403 403 403 403 403 403 400'),
    ('DELETE', '/api/hall/forts/1/photo/',                  None,    '403 403 403 403 403 403 403 403 403 403 200'),
    # Sieň legiend: read with GET /api/hall/, written by the superadmin
    ('POST',   '/api/hall/archive/',                        {},      '403 403 403 403 403 403 403 403 403 403 400'),
    ('DELETE', '/api/hall/archive/0/',                      None,    '403 403 403 403 403 403 403 403 403 403 404'),
    # the week of the fort destroyers (7. 11. 2026): the superadmin only – no week yet to post, the one place archived
    ('PUT',    '/api/hall/forts/week/',                     {},      '403 403 403 403 403 403 403 403 403 403 400'),
    ('POST',   '/api/hall/forts/publish/',                  None,    '403 403 403 403 403 403 403 403 403 403 400'),
    ('POST',   '/api/hall/forts/archive/',                  None,    '403 403 403 403 403 403 403 403 403 403 201'),
    # -------- events: the superadmin only (the channel reminders and the calendar's editor)
    ('GET',    '/api/events/channel/',                      None,    '403 403 403 403 403 403 403 403 403 403 200'),
    ('PUT',    '/api/events/channel/{event}/',              {},      '403 403 403 403 403 403 403 403 403 403 400'),
    ('PATCH',  '/api/events/channel/{event}/',              {},      '403 403 403 403 403 403 403 403 403 403 400'),
    ('DELETE', '/api/events/channel/{event}/',              None,    '403 403 403 403 403 403 403 403 403 403 204'),
    # no bot token in the tests: the superadmin gets as far as "bot off"; an irregular event without a date first
    ('POST',   '/api/events/channel/{event}/preview/',      None,    '403 403 403 403 403 403 403 403 403 403 503'),
    ('POST',   '/api/events/channel/{irregular}/preview/',  None,    '403 403 403 403 403 403 403 403 403 403 400'),
    ('GET',    '/api/events/manage/',                       None,    '403 403 403 403 403 403 403 403 403 403 200'),
    ('POST',   '/api/events/manage/',                       {},      '403 403 403 403 403 403 403 403 403 403 400'),
    ('GET',    '/api/events/manage/{event}/',               None,    '403 403 403 403 403 403 403 403 403 403 200'),
    ('PATCH',  '/api/events/manage/{event}/',               {},      '403 403 403 403 403 403 403 403 403 403 200'),
    ('DELETE', '/api/events/manage/{event}/',               None,    '403 403 403 403 403 403 403 403 403 403 204'),
    ('PUT',    '/api/events/manage/{irregular}/date/',      {},      '403 403 403 403 403 403 403 403 403 403 400'),
    ('DELETE', '/api/events/manage/{irregular}/date/',      None,    '403 403 403 403 403 403 403 403 403 403 200'),
    ('PUT',    '/api/events/manage/{event}/run/',           {},      '403 403 403 403 403 403 403 403 403 403 400'),
    ('DELETE', '/api/events/manage/{event}/run/',           {},      '403 403 403 403 403 403 403 403 403 403 400'),
    # -------- forum moderation: the superadmin only (no role has the forum cookie of the author)
    ('PATCH',  '/api/forum/{thread}/',                      {'pinned': True},
                                                                     '403 403 403 403 403 403 403 403 403 403 200'),
    ('DELETE', '/api/forum/{thread}/',                      None,    '403 403 403 403 403 403 403 403 403 403 204'),
    ('DELETE', '/api/forum/posts/{post}/',                  None,    '403 403 403 403 403 403 403 403 403 403 200'),
]
# fmt: on

# Endpoints anyone may call, with the reason. The completeness test skips them, MATRIX may still have rows for them:
# the forum is public, but its moderation (pinning, deleting other people's threads and messages) is the superadmin's –
# a new moderation method of a public endpoint gets a MATRIX row too.
PUBLIC = {
    'api/health/': 'monitoring',
    'api/alliances/': 'content',
    'api/links/': 'content',
    'api/events/': 'calendar',
    'api/events/<int:pk>/ics': 'calendar',
    'api/calendar.ics': 'calendar',
    'api/guides/': 'content',
    'api/guides/<slug:slug>/': 'content',
    'api/status/': 'content',
    'api/commanders/': 'content',
    'api/commanders/marches/': 'content',
    'api/armory/': 'content',
    'api/link-preview/(?P<cz>cz/)?kalendar/?$': 'preview',
    'api/link-preview/<path:path>': 'preview',
    'api/guide-page/<path:path>': 'seo',
    'api/auth/discord/login/': 'sign-in',
    'api/auth/discord/callback/': 'sign-in',
    'api/auth/local/signup/': 'sign-up',
    'api/auth/local/login/': 'sign-in',
    'api/auth/local/reset/': 'code',
    # Discord signs the request (DISCORD_PUBLIC_KEY), test_discord_interactions.py
    'api/discord/interactions/': 'signed',
    # anonymous by design – the own posts by a signed cookie, test_forum.py
    'api/forum/': 'anonymous',
    'api/forum/<int:thread_id>/': 'anonymous',
    'api/forum/posts/<int:post_id>/': 'anonymous',
    'api/forum/posts/<int:post_id>/like/': 'anonymous',
    # the counts for everyone, POST by any signed-in player, who reacted the superadmin only – test_reactions.py
    'api/reactions/<str:target>/': 'reactions',
}


def api_routes(patterns=None, prefix=''):
    """(route, view) of every URL under /api/ – the route spelled like ResolverMatch.route"""
    for pattern in get_resolver().url_patterns if patterns is None else patterns:
        route = prefix + str(pattern.pattern).removeprefix('^')
        if isinstance(pattern, URLResolver):
            yield from api_routes(pattern.url_patterns, route)
        elif route.startswith('api/'):
            yield route, pattern.callback


def methods_of(view) -> list[str]:
    """The methods a DRF view answers (OPTIONS and HEAD are DRF's own); a plain Django view: ['?']"""
    cls = getattr(view, 'cls', None)
    if cls is None:
        return ['?']
    return [m for m in cls().allowed_methods if m not in ('OPTIONS', 'HEAD')]


@override_settings(
    SUPERUSER_GUARD=True,
    DISCORD_ADMIN_IDS=[ADMIN_ID],
    DISCORD_BOT_TOKEN='',
    DISCORD_WEBHOOK_URL='',
)
class PermissionMatrixTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        def discord(discord_id, approved=True, terms=True, **flags):
            player = make_player(discord_id, approved=approved, terms=terms)
            Player.objects.filter(pk=player.pk).update(**flags)
            return player

        def local(name, approved):
            user = User.objects.create_user(f'local_{name.lower()}')
            return Player.objects.create(
                user=user,
                ingame_name=name,
                login=name.casefold(),
                approved=approved,
                announced=True,
                remind_discord=False,
                terms_version=TERMS_VERSION,
            )

        players = {
            'd_wait': discord('101', approved=False),
            'd_ok': discord('102'),
            'd_terms': discord('103', terms=False),
            'l_wait': local('Cakatel', approved=False),
            'l_ok': local('Lubo', approved=True),
            'r4': discord('104', kvk_reviewer=True),
            'eval': discord('105', evaluation_settings=True),
            'revoked': discord('106', approved=False, kvk_reviewer=True, evaluation_settings=True),
            'forged': discord('107'),
            'super': discord(ADMIN_ID),
        }
        for role in ('forged', 'super'):
            User.objects.filter(pk=players[role].user_id).update(is_superuser=True, is_staff=True)
        cls.users = {role: User.objects.get(pk=player.user_id) for role, player in players.items()}

        event = KingdomEvent.objects.create(name_sk='Ruiny', starts_at=utc(2026, 10, 10, 18), repeat_days=7)
        irregular = KingdomEvent.objects.create(name_sk='Silk Road', starts_at=utc(2026, 10, 1, 18), irregular=True)
        signup = KvkSignup.objects.create(player=players['d_ok'], role='rally', kind='cavalry', primary='Attila')
        entry = HallEntry.objects.create(category=HallEntry.Category.FORTS, place=1, name='Nelly')
        march = March.objects.create(player=players['d_ok'], position=1, kind='cavalry', primary='Attila')
        thread = ForumThread.objects.create(title='Pravidlá', last_post_at=utc(2026, 10, 25, 18), aliases=1)
        post = ForumPost.objects.create(thread=thread, alias=1, body='Ahoj')
        cls.ids = {
            'march': march.pk,
            'thread': thread.pk,
            'post': post.pk,
            'event': event.pk,
            'irregular': irregular.pk,
            'signup': signup.pk,
            'entry': entry.pk,
            'player': players['d_ok'].pk,
            'local': players['l_ok'].pk,
            'waiting_local': players['l_wait'].pk,
        }

    def setUp(self):
        media = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, media, ignore_errors=True)
        override = override_settings(PRIVATE_MEDIA_ROOT=media)
        override.enable()
        self.addCleanup(override.disable)
        self.addCleanup(cache.clear)
        # one session per role; a call that signs out or deletes the account is rolled back and its cookie put back.
        # One client for every call: a new one would load the middleware again (WhiteNoise scans the static files)
        self.sessions = {role: self.session_of(role) for role in ROLES if role != 'anon'}

    def session_of(self, role: str) -> str:
        # a sign-in over another user's session would delete that one
        self.client.cookies.clear()
        self.client.force_login(self.users[role])
        if role == 'super':
            # what a Discord sign-in of an admin ID leaves in the session (views.discord_callback)
            session = self.client.session
            guard.prove_discord(SimpleNamespace(session=session), ADMIN_ID)
            session.save()
        return self.client.cookies[settings.SESSION_COOKIE_NAME].value

    def status(self, role: str, method: str, path: str, body) -> int:
        """One call in a savepoint that is rolled back, with the throttles reset"""
        cache.clear()
        self.client.cookies.clear()
        if role != 'anon':
            self.client.cookies[settings.SESSION_COOKIE_NAME] = self.sessions[role]
        with transaction.atomic():
            kwargs = {'content_type': 'application/json'} if body is not None else {}
            response = getattr(self.client, method.lower())(path, body, **kwargs)
            transaction.set_rollback(True)
        return response.status_code

    def test_every_role_gets_what_the_matrix_says(self):
        wrong = []
        for method, path, body, codes in MATRIX:
            expected = codes.split()
            self.assertEqual(len(expected), len(ROLES), f'{method} {path}: {len(expected)} codes for {len(ROLES)} roles')
            url = path.format_map(self.ids)
            for role, code in zip(ROLES, expected):
                got = self.status(role, method, url, body)
                if got != int(code):
                    wrong.append(f'{method} {path} as {role}: expected {code} got {got}')
        if wrong:
            self.fail('\n' + '\n'.join(wrong))

    def test_every_endpoint_is_in_the_matrix(self):
        """A new endpoint (or a new method of one) needs a MATRIX row or a place in PUBLIC."""
        covered = {(resolve(path.split('?')[0].format_map(self.ids)).route, method) for method, path, _, _ in MATRIX}
        missing = [
            f'{method} /{route}'
            for route, view in api_routes()
            if route not in PUBLIC
            for method in methods_of(view)
            if (route, method) not in covered
        ]
        if missing:
            self.fail('\nNot in MATRIX nor PUBLIC (accounts/test_permissions.py):\n' + '\n'.join(missing))
        # and nothing in the tables that is no longer there
        routes = {route for route, _ in api_routes()}
        self.assertFalse(set(PUBLIC) - routes, 'PUBLIC names an endpoint that does not exist')

    def test_anyone_may_write_in_the_forum(self):
        self.assertEqual(self.status('anon', 'POST', '/api/forum/', FORUM), 201)

    def test_a_write_without_the_csrf_token_is_refused(self):
        """MATRIX runs without the CSRF check (the test client skips it); a signed-in player's write needs the token."""
        client = Client(enforce_csrf_checks=True)
        client.cookies[settings.SESSION_COOKIE_NAME] = self.sessions['d_ok']
        response = client.post('/api/me/marches/', MARCH, content_type='application/json')
        self.assertEqual(response.status_code, 403)
        client.get('/api/auth/me/')
        token = client.cookies['csrftoken'].value
        response = client.post('/api/me/marches/', MARCH, content_type='application/json', HTTP_X_CSRFTOKEN=token)
        self.assertEqual(response.status_code, 201)

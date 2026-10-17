"""Sign in with Discord and the player's own account (/api/auth/…).

The browser leaves the site for discord.com and comes back to the callback, which logs the player into a normal
Django session (SameSite=Lax cookie). The Angular app reads the result from /api/auth/me/.
"""

import logging
import re
import secrets
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from django.conf import settings
from django.contrib.auth import get_user_model, login, logout
from django.db import transaction
from django.http import Http404, HttpResponseRedirect
from django.utils import timezone
from django.utils.http import url_has_allowed_host_and_scheme
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET
from rest_framework.decorators import api_view, throttle_classes
from rest_framework.exceptions import NotAuthenticated, PermissionDenied
from rest_framework.response import Response
from rest_framework.permissions import SAFE_METHODS
from rest_framework.throttling import SimpleRateThrottle, UserRateThrottle

from . import discord_oauth, guard, local_auth
from .models import TERMS_VERSION, Player, PlayerSettings
from .serializers import ProfileSerializer

log = logging.getLogger(__name__)
User = get_user_model()

STATE_KEY = 'discord_oauth_state'
NEXT_KEY = 'discord_oauth_next'
# a player without Discord links the account to Discord: the player's pk while the browser is on discord.com
LINK_KEY = 'discord_oauth_link'
# Slovak account page; the Czech app passes /cz/ucet itself
DEFAULT_NEXT = '/ucet'
AVATAR_HASH = re.compile(r'[0-9A-Za-z_]{1,64}')


class CallbackThrottle(SimpleRateThrottle):
    """Sign-ins per IP – each one costs two requests to Discord. The cache is per process, so it is a soft limit."""

    scope = 'discord_callback'
    rate = '20/hour'

    def get_cache_key(self, request, view):
        return self.cache_format % {'scope': self.scope, 'ident': self.get_ident(request)}


def redirect_uri(request) -> str:
    """Must match a redirect URI registered in the Discord application exactly."""
    path = '/api/auth/discord/callback/'
    return settings.SITE_URL + path if settings.SITE_URL else request.build_absolute_uri(path)


def safe_next(value: str | None) -> str:
    """A path on this site only – 'https://evil.example', '//evil.example' and the like fall back to /ucet."""
    if (
        value
        and len(value) <= 512
        and value.startswith('/')
        and url_has_allowed_host_and_scheme(value, allowed_hosts=None)
    ):
        return value
    return DEFAULT_NEXT


def back_to(next_url: str, status: str = '') -> HttpResponseRedirect:
    """Redirect to next with ?login=<status>; a login=… left from an earlier attempt is dropped."""
    parts = urlsplit(next_url)
    query = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if k != 'login']
    if status:
        query.append(('login', status))
    return HttpResponseRedirect(urlunsplit(parts._replace(query=urlencode(query))))


def lang_of(next_url: str) -> str:
    """The language of the page the player signed in from: /cz/… Czech, else Slovak."""
    path = urlsplit(next_url).path
    return 'cs' if path == '/cz' or path.startswith('/cz/') else 'sk'


def ask_for_name(next_url: str) -> str:
    """A player without an in-game name (the first sign-in) lands on the account page with the name field first
    (Gether 11. 10. 2026: required at the first sign-in); ?next= brings them back where they were going."""
    path = urlsplit(next_url).path
    account = '/cz/ucet' if lang_of(next_url) == 'cs' else DEFAULT_NEXT
    query = {'meno': '1'}
    if path.rstrip('/') != account:
        query['next'] = next_url
    return f'{account}?{urlencode(query)}'


@transaction.atomic
def save_player(profile: dict, lang: str = 'sk') -> User:
    """Creates or refreshes the user + player behind a Discord profile (see discord_oauth.fetch_user). A new player
    gets the language of the website they signed in on; later only the player changes it (/ucet)."""
    discord_id = profile['id']
    username = str(profile['username'])[:40]
    global_name = str(profile.get('global_name') or '')[:64]
    avatar = profile.get('avatar') or ''
    if not isinstance(avatar, str) or not AVATAR_HASH.fullmatch(avatar):
        avatar = ''

    # matched by the Discord ID, so a user renamed in the admin keeps their account
    player = Player.objects.select_related('user').filter(discord_id=discord_id).first()
    if player:
        user = player.user
    else:
        # no password and not staff; rights granted later in the admin are never taken away here
        user, created = User.objects.get_or_create(username=f'discord_{discord_id}')
        if created:
            user.set_unusable_password()
        # a new player waits for the superadmin's approval and the worker tells the superadmin (newcomers.py) –
        # unless the superadmin lets everyone in for now (PlayerSettings.auto_approve): approved, nobody is told
        player = Player(user=user, discord_id=discord_id, lang=lang)
        if PlayerSettings.load().auto_approve:
            player.approved = player.announced = True
    if discord_id in settings.DISCORD_ADMIN_IDS:
        # the superadmin signs in with Discord too (.env DISCORD_ADMIN_IDS) – on any database, also after a snapshot
        # import that leaves Discord accounts out
        user.is_staff = user.is_superuser = True
        player.approved = player.announced = True
    user.first_name = (global_name or username)[:150]  # readable in the Users admin
    user.save()
    player.username, player.global_name, player.avatar = username, global_name, avatar
    player.save()
    return user


@never_cache
@require_GET
def discord_login(request):
    """/api/auth/discord/login/?next=/cz/ucet → discord.com, which sends the player back to the callback."""
    if not discord_oauth.login_enabled():
        raise Http404
    state = secrets.token_urlsafe(24)
    request.session[STATE_KEY] = state
    request.session[NEXT_KEY] = safe_next(request.GET.get('next'))
    # ?link=1: the signed-in player without Discord links this account (link_player), no new account
    player = player_of(request.user)
    if request.GET.get('link') == '1' and player and player.local:
        request.session[LINK_KEY] = player.pk
    else:
        request.session.pop(LINK_KEY, None)
    return HttpResponseRedirect(discord_oauth.authorize_url(state, redirect_uri(request)))


@never_cache
@require_GET
def discord_callback(request):
    # single use: a reloaded or replayed callback finds no state
    expected = request.session.pop(STATE_KEY, '')
    next_url = safe_next(request.session.pop(NEXT_KEY, ''))
    link = request.session.pop(LINK_KEY, None)
    if not discord_oauth.login_enabled():
        raise Http404

    error = request.GET.get('error')
    if error:
        if error != 'access_denied':
            log.warning('Discord login refused: %r', error[:100])  # %r: no forged log lines from the URL
        return back_to(next_url, 'cancelled' if error == 'access_denied' else 'error')

    # the state proves this browser started the sign-in (no login CSRF); checked before anything goes to Discord
    state = request.GET.get('state', '')
    code = request.GET.get('code')
    if not expected or not secrets.compare_digest(expected.encode(), state.encode()) or not code:
        return back_to(next_url, 'error')
    if not CallbackThrottle().allow_request(request, None):
        log.warning('Discord login throttled')
        return back_to(next_url, 'error')

    try:
        profile = discord_oauth.fetch_user(discord_oauth.exchange_code(code, redirect_uri(request)))
    except discord_oauth.OAuthError as exc:
        log.warning('Discord login failed: %s', exc)
        return back_to(next_url, 'error')

    if link is not None:
        status = link_player(request, link, profile)
        if status:
            return back_to(next_url, status)
    user = save_player(profile, lang=lang_of(next_url))
    if not user.is_active:  # blocked in the admin
        log.warning('Discord login of inactive user %s', user.pk)
        return back_to(next_url, 'error')
    login(request, user, backend='django.contrib.auth.backends.ModelBackend')
    # Discord confirmed the ID: an admin from .env gets the admin rights in this session (guard.py)
    guard.prove_discord(request, profile['id'])
    if not user.player.ingame_name.strip():
        return back_to(ask_for_name(next_url))
    return back_to(next_url, 'linked' if link is not None else '')


@transaction.atomic
def link_player(request, player_pk: int, profile: dict) -> str:
    """The player without Discord gets this Discord ID (Gether 17. 10. 2026: "všetko naviazané a prepojené"): the same
    account – marches, KvK sign-ups, the approval, R4 – now with the bot's DMs; signs in with Discord from now on, the
    password and the code are dropped. '' = linked, else the ?login= status: `taken` when the Discord account already
    has its own account on the website (two accounts are not merged)."""
    player = player_of(request.user)
    if not player or player.pk != player_pk or not player.local:
        return 'error'
    if Player.objects.filter(discord_id=profile['id']).exists():
        return 'taken'
    player.discord_id = profile['id']
    player.login, player.reset_code, player.reset_until = None, '', None
    player.remind_discord = True
    player.save(update_fields=['discord_id', 'login', 'reset_code', 'reset_until', 'remind_discord'])
    player.user.set_unusable_password()
    player.user.save(update_fields=['password'])
    log.info('Player %s linked to Discord', player.pk)
    return ''


def player_of(user) -> Player | None:
    # admins signed in with a password have no Discord profile – they are not site accounts
    return getattr(user, 'player', None) if user.is_authenticated else None


def not_approved() -> Response:
    """A new player adds marches and KvK sign-ups only once the superadmin approves them (Gether 12. 10. 2026)."""
    return Response({'detail': 'not_approved'}, status=403)


def cannot_post(player: Player) -> Response | None:
    """Marches and KvK sign-ups: only an approved player who agreed to the current terms of use."""
    if not player.may_post:
        return not_approved()
    if not player.terms_accepted:
        return Response({'detail': 'terms'}, status=403)
    return None


class ProfileThrottle(UserRateThrottle):
    """Changes of the own profile (the in-game name, the power) per player – like the other writes of the API."""

    scope = 'profile'
    rate = '60/minute'

    def allow_request(self, request, view):
        return request.method in SAFE_METHODS or super().allow_request(request, view)


@never_cache
@ensure_csrf_cookie
@api_view(['GET', 'PATCH', 'DELETE'])
@throttle_classes([ProfileThrottle])
def me(request):
    """GET: is login switched on and who is signed in. PATCH: the player's in-game name and power. DELETE: the player
    deletes their own account."""
    if request.method == 'DELETE':
        return delete_account(request)
    if request.method == 'PATCH':
        update_profile(request)
    return Response(me_data(request))


def me_data(request) -> dict:
    """GET /api/auth/me/. Signing in without Discord is always on (local_auth.py); `signup_open` = the sign-up
    without Discord is not full."""
    return {
        'login_enabled': True,
        'discord_login': discord_oauth.login_enabled(),
        'signup_open': local_auth.sign_up_open(),
        'user': signed_in(request),
    }


def signed_in(request) -> dict | None:
    player = player_of(request.user)
    if not player:
        return None
    # the power of the KvK evaluation – the player's own or the one the superadmin wrote down (Gether 14. 10. 2026)
    evaluation = getattr(player, 'evaluation', None)
    return {
        'discord_id': player.discord_id,
        # without Discord (local_auth.py): no bot DMs, the password on /ucet
        'local': player.local,
        'name': player.name,
        'avatar_url': player.avatar_url,
        'ingame_name': player.ingame_name,
        # SK/CZ: the website opens in it, the bot writes in it (Gether 17. 10. 2026)
        'lang': player.lang,
        'power': float(evaluation.power) if evaluation and evaluation.power is not None else None,
        # adds marches and KvK sign-ups (a new player waits for the superadmin, Gether 12. 10. 2026)
        'approved': player.may_post,
        # agreed to the current terms of use – else the web asks first (Gether 12. 10. 2026)
        'terms_accepted': player.terms_accepted,
        'is_staff': request.user.is_staff,
        # manages events (admin, irregular dates in the calendar)
        'is_superuser': request.user.is_superuser,
        # /vyhodnocovanie – the superadmin gives it like R4 (Gether 13. 10. 2026): the estimate with the variables, or
        # (14. 10. 2026) only the published required acclaim
        'evaluation_settings': player.evaluation_settings or request.user.is_superuser,
        'evaluation_overview': player.evaluation_overview or player.evaluation_settings or request.user.is_superuser,
    }


def update_profile(request):
    player = player_of(request.user)
    if not player:
        # anonymous, or an admin signed in with a password (no Discord profile)
        raise PermissionDenied() if request.user.is_authenticated else NotAuthenticated()
    profile = ProfileSerializer(player, data=request.data, partial=True)
    profile.is_valid(raise_exception=True)
    profile.save()


def delete_account(request):
    user = request.user
    if not user.is_authenticated:
        raise NotAuthenticated()
    # leadership accounts are removed in the admin, never by a stray click on the website
    if user.is_staff or user.is_superuser or not player_of(user):
        raise PermissionDenied('Tento účet sa dá zmazať iba v admine.')
    player = user.player
    logout(request)
    player.delete_account()
    return Response(status=204)


@never_cache
@api_view(['POST'])
def accept_terms(request):
    """The player agrees to the current terms of use: the version and the time are saved (the privacy page says so)."""
    player = player_of(request.user)
    if not player:
        raise PermissionDenied() if request.user.is_authenticated else NotAuthenticated()
    player.terms_version = TERMS_VERSION
    player.terms_accepted_at = timezone.now()
    player.save(update_fields=['terms_version', 'terms_accepted_at'])
    return Response(me_data(request))


@api_view(['POST'])
def sign_out(request):
    """CSRF is enforced by SessionAuthentication (X-CSRFToken header from the csrftoken cookie)."""
    logout(request)
    return Response(status=204)


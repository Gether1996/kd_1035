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
from django.utils.http import url_has_allowed_host_and_scheme
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET
from rest_framework.decorators import api_view
from rest_framework.exceptions import NotAuthenticated, PermissionDenied
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle

from . import discord_oauth
from .models import Player

log = logging.getLogger(__name__)
User = get_user_model()

STATE_KEY = 'discord_oauth_state'
NEXT_KEY = 'discord_oauth_next'
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


@transaction.atomic
def save_player(profile: dict) -> User:
    """Creates or refreshes the user + player behind a Discord profile (see discord_oauth.fetch_user)."""
    discord_id = profile['id']
    username = str(profile['username'])[:40]
    global_name = str(profile.get('global_name') or '')[:64]
    avatar = profile.get('avatar') or ''
    if not isinstance(avatar, str) or not AVATAR_HASH.fullmatch(avatar):
        avatar = ''

    # never staff and no password; leadership may grant staff later in the admin – that is never touched here
    user, created = User.objects.get_or_create(username=f'discord_{discord_id}')
    if created:
        user.set_unusable_password()
    user.first_name = (global_name or username)[:150]  # readable in the Users admin
    user.save()
    Player.objects.update_or_create(
        user=user,
        defaults={'discord_id': discord_id, 'username': username, 'global_name': global_name, 'avatar': avatar},
    )
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
    return HttpResponseRedirect(discord_oauth.authorize_url(state, redirect_uri(request)))


@never_cache
@require_GET
def discord_callback(request):
    # single use: a reloaded or replayed callback finds no state
    expected = request.session.pop(STATE_KEY, '')
    next_url = safe_next(request.session.pop(NEXT_KEY, ''))
    if not discord_oauth.login_enabled():
        raise Http404

    error = request.GET.get('error')
    if error:
        if error != 'access_denied':
            log.warning('Discord login refused: %s', error[:100])
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

    user = save_player(profile)
    if not user.is_active:  # blocked in the admin
        log.warning('Discord login of inactive user %s', user.pk)
        return back_to(next_url, 'error')
    login(request, user, backend='django.contrib.auth.backends.ModelBackend')
    return back_to(next_url)


def player_of(user) -> Player | None:
    # admins signed in with a password have no Discord profile – they are not site accounts
    return getattr(user, 'player', None) if user.is_authenticated else None


@never_cache
@ensure_csrf_cookie
@api_view(['GET', 'DELETE'])
def me(request):
    """GET: is login switched on and who is signed in. DELETE: the player deletes their own account."""
    if request.method == 'DELETE':
        return delete_account(request)
    player = player_of(request.user)
    user = None
    if player:
        user = {
            'discord_id': player.discord_id,
            'name': player.name,
            'avatar_url': player.avatar_url,
            'is_staff': request.user.is_staff,
        }
    return Response({'login_enabled': discord_oauth.login_enabled(), 'user': user})


def delete_account(request):
    user = request.user
    if not user.is_authenticated:
        raise NotAuthenticated()
    # leadership accounts are removed in the admin, never by a stray click on the website
    if user.is_staff or user.is_superuser or not player_of(user):
        raise PermissionDenied('Tento účet sa dá zmazať iba v admine.')
    logout(request)
    user.delete()  # cascades to the player
    return Response(status=204)


@api_view(['POST'])
def sign_out(request):
    """CSRF is enforced by SessionAuthentication (X-CSRFToken header from the csrftoken cookie)."""
    logout(request)
    return Response(status=204)

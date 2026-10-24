"""Sign in without Discord (Gether 17. 10. 2026): the in-game name and a password – no e-mail, no third party.

Bots are kept out by the superadmin's approval (a new player does nothing before it, also with auto-approve on – that
is for Discord players only) and in front of it by:
- PENDING_CAP: at most this many players without Discord who signed up in the last PENDING_WINDOW wait for the
  approval at once; then the sign-up is closed until the superadmin approves or deletes some (the Hráči list on
  /hraci) or they grow old – whatever number of IPs a bot has; abandoned accounts never close it for good,
- per-IP limits (SignupThrottle here, kd_login in nginx), counted in memory – no IP is stored,
- a field hidden from people (`website`) and the time the form was open (`elapsed`, ms) – naive bots fill in the one
  and post at once.

A forgotten password: the superadmin creates a one-off code (reset_code) and gives it to the player – in the game,
on Messenger…; the player sets a new password with the in-game name and the code. No admin rights ever: the user is
never staff (and the guard would ignore the flags of a session that did not sign in as an admin from .env).

The anonymous POSTs check the CSRF token themselves – DRF's SessionAuthentication checks it for signed-in users only.
"""

import hashlib
import logging
import secrets
import unicodedata
from datetime import timedelta

from django.contrib.auth import get_user_model, login, update_session_auth_hash
from django.contrib.auth.hashers import make_password
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.views.decorators.cache import never_cache
from rest_framework.authentication import SessionAuthentication
from rest_framework.decorators import api_view, authentication_classes, permission_classes, throttle_classes
from rest_framework.exceptions import NotAuthenticated, PermissionDenied
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle

from . import views
from .models import Player

log = logging.getLogger(__name__)
User = get_user_model()

# players without Discord waiting for the approval at once (Gether 17. 10. 2026: "strop 10")
PENDING_CAP = 10
# only the recent ones count: ten abandoned sign-ups would otherwise close it until somebody noticed
PENDING_WINDOW = timedelta(days=14)
NAME_MAX = 32
PASSWORD_MAX = 128
# a person needs a few seconds to type a name and a password twice
MIN_ELAPSED_MS = 3000
# the superadmin's code for a new password: 8 characters without 0/O, 1/I/L, about 10^12 codes
CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
CODE_LENGTH = 8
CODE_VALID = timedelta(days=3)


class SignupThrottle(SimpleRateThrottle):
    """New accounts per IP (in memory, per process – a soft limit; PENDING_CAP is the hard one). Counted only when an
    account is about to be created, so a too short password does not use it up."""

    scope = 'local_signup'
    rate = '3/hour'

    def get_cache_key(self, request, view):
        return self.cache_format % {'scope': self.scope, 'ident': self.get_ident(request)}


class SignInThrottle(SignupThrottle):
    """Password and code attempts per IP – nginx allows 6 a minute, this a few dozen an hour."""

    scope = 'local_signin'
    rate = '30/hour'


class Csrf(SessionAuthentication):
    """The CSRF check of SessionAuthentication also for an anonymous visitor (sign up, sign in, the code)."""

    def authenticate(self, request):
        self.enforce_csrf(request)
        return super().authenticate(request)


def clean_name(value) -> str:
    """The in-game name as typed: whitespace inside collapsed, no control characters."""
    if not isinstance(value, str):
        return ''
    name = ' '.join(value.split())
    if any(unicodedata.category(ch).startswith('C') for ch in name):
        return ''
    return name


def login_key(name: str) -> str:
    """The in-game name a player signs in with: case and the Unicode form do not matter ("Ľubo" = "ľubo")."""
    return unicodedata.normalize('NFKC', clean_name(name)).casefold()


def name_taken(name: str, exclude: Player | None = None) -> bool:
    """Another player on the website has this in-game name already – also one with Discord (nobody signs up as
    somebody else; the players are a few hundred, read in Python because SQLite folds ASCII only)."""
    key = login_key(name)
    players = Player.objects.exclude(pk=exclude.pk) if exclude else Player.objects.all()
    return any(login_key(other) == key for other in players.values_list('ingame_name', flat=True))


def code_hash(code: str) -> str:
    return hashlib.sha256(code.upper().replace('-', '').replace(' ', '').encode()).hexdigest()


def password_errors(password, user) -> list[str] | None:
    """Django's validators (8 characters, not common, not only digits, not like the name) as codes for the web."""
    if not isinstance(password, str) or not password:
        return ['required']
    if len(password) > PASSWORD_MAX:
        return ['password_too_long']
    try:
        validate_password(password, user)
    except ValidationError as exc:
        return sorted({error.code or 'invalid' for error in exc.error_list})
    return None


def refuse(detail: str, status=400, **extra) -> Response:
    return Response({'detail': detail, **extra}, status=status)


def body_of(request) -> dict:
    return request.data if isinstance(request.data, dict) else {}


def start_session(request, user) -> None:
    login(request, user, backend='django.contrib.auth.backends.ModelBackend')


@never_cache
@api_view(['POST'])
@authentication_classes([Csrf])
@permission_classes([AllowAny])
def sign_up(request):
    """POST {name, password, lang, website, elapsed} → a new player without Discord, signed in; waits for the approval."""
    body = body_of(request)
    if body.get('website') or not isinstance(body.get('elapsed'), int) or body['elapsed'] < MIN_ELAPSED_MS:
        log.warning('Sign-up without Discord refused: looks like a bot')
        return refuse('invalid')
    if request.user.is_authenticated:
        return refuse('signed_in')
    name = clean_name(body.get('name'))
    if not 2 <= len(name) <= NAME_MAX:
        return refuse('name')
    password = body.get('password')
    errors = password_errors(password, User(first_name=name))
    if errors:
        return refuse('password', errors=errors)
    lang = body.get('lang') if body.get('lang') in ('sk', 'cs') else 'sk'
    if not SignupThrottle().allow_request(request, None):
        log.warning('Sign-up without Discord throttled')
        return refuse('throttled', status=429)

    with transaction.atomic():
        if waiting() >= PENDING_CAP:
            log.warning('Sign-up without Discord closed: %s players wait for the approval', PENDING_CAP)
            return refuse('full', status=409)
        if name_taken(name):
            return refuse('name_taken', status=409)
        user = User(username=f'local_{secrets.token_hex(8)}', first_name=name[:150])
        user.set_password(password)
        user.save()
        try:
            # never approved at once – auto-approve is for Discord players; no bot DMs reach them
            Player.objects.create(
                user=user, ingame_name=name, login=login_key(name), lang=lang, remind_discord=False
            )
        except IntegrityError:  # the same name at the same moment
            transaction.set_rollback(True)
            return refuse('name_taken', status=409)
    start_session(request, user)
    log.info('New player without Discord: user %s', user.pk)
    return Response(views.me_data(request), status=201)


def local_player(name) -> Player | None:
    key = login_key(name) if isinstance(name, str) else ''
    if not key:
        return None
    return Player.objects.select_related('user').filter(login=key, discord_id=None).first()


@never_cache
@api_view(['POST'])
@authentication_classes([Csrf])
@permission_classes([AllowAny])
@throttle_classes([SignInThrottle])
def sign_in(request):
    """POST {name, password} → signed in. One answer for an unknown name and a wrong password."""
    body = body_of(request)
    player = local_player(body.get('name'))
    password = body.get('password') if isinstance(body.get('password'), str) else ''
    if not player or len(password) > PASSWORD_MAX:
        make_password(password[:PASSWORD_MAX])  # about as slow as a real check
        return refuse('invalid')
    if not player.user.check_password(password) or not player.user.is_active:
        return refuse('invalid')
    start_session(request, player.user)
    return Response(views.me_data(request))


@never_cache
@api_view(['POST'])
@authentication_classes([Csrf])
@permission_classes([AllowAny])
@throttle_classes([SignInThrottle])
def reset(request):
    """POST {name, code, password} – the superadmin's one-off code sets a new password and signs the player in."""
    body = body_of(request)
    player = local_player(body.get('name'))
    code = body.get('code') if isinstance(body.get('code'), str) else ''
    valid = (
        player is not None
        and player.user.is_active
        and player.reset_code
        and player.reset_until is not None
        and player.reset_until > timezone.now()
        and secrets.compare_digest(player.reset_code, code_hash(code[:32]))
    )
    if not valid:
        return refuse('invalid')
    errors = password_errors(body.get('password'), player.user)
    if errors:
        return refuse('password', errors=errors)
    player.user.set_password(body['password'])
    player.user.save(update_fields=['password'])
    player.reset_code, player.reset_until = '', None
    player.save(update_fields=['reset_code', 'reset_until'])
    start_session(request, player.user)
    log.info('Player %s set a new password with the code', player.pk)
    return Response(views.me_data(request))


@never_cache
@api_view(['POST'])
@throttle_classes([SignInThrottle])
def change_password(request):
    """POST {current, password} – a signed-in player without Discord changes the password; the session stays."""
    player = views.player_of(request.user)
    if not player:
        raise PermissionDenied() if request.user.is_authenticated else NotAuthenticated()
    if not player.local:
        return refuse('discord', status=403)
    body = body_of(request)
    current = body.get('current') if isinstance(body.get('current'), str) else ''
    if not request.user.check_password(current[:PASSWORD_MAX]):
        return refuse('current')
    errors = password_errors(body.get('password'), request.user)
    if errors:
        return refuse('password', errors=errors)
    request.user.set_password(body['password'])
    request.user.save(update_fields=['password'])
    update_session_auth_hash(request, request.user)  # other devices are signed out, this one stays
    return Response(status=204)


def new_code(player: Player) -> str:
    """A code for a new password (shown once to the superadmin, only its hash is kept) – e.g. 7KQF-2MPX."""
    code = ''.join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))
    player.reset_code = code_hash(code)
    player.reset_until = timezone.now() + CODE_VALID
    player.save(update_fields=['reset_code', 'reset_until'])
    return f'{code[:4]}-{code[4:]}'


def superadmin_player(request, player_id) -> Player:
    if not request.user.is_superuser:
        raise PermissionDenied()
    player = get_object_or_404(Player.objects.select_related('user'), pk=player_id)
    if not player.local:
        raise PermissionDenied('Iba hráč bez Discordu.')
    return player


@never_cache
@api_view(['POST'])
def reset_code(request, player_id):
    """POST (superadmin) → {code, until}: a one-off code for a new password of a player without Discord."""
    player = superadmin_player(request, player_id)
    code = new_code(player)
    log.info('Code for a new password of player %s', player.pk)
    return Response({'code': code, 'until': player.reset_until.isoformat()})


@never_cache
@api_view(['DELETE'])
def delete_local(request, player_id):
    """DELETE (superadmin): a player without Discord who waits for the approval – a bot or someone unknown."""
    player = superadmin_player(request, player_id)
    if player.approved or player.user.is_staff or player.user.is_superuser:
        return refuse('approved', status=409)
    player.delete_account()
    log.info('Player %s without Discord deleted by the superadmin', player_id)
    return Response(status=204)


def sign_up_open() -> bool:
    """For GET /api/auth/me/: the web says the sign-up is full before the player fills it in."""
    return waiting() < PENDING_CAP


def waiting() -> int:
    """Players without Discord waiting for the approval who signed up in the last PENDING_WINDOW."""
    since = timezone.now() - PENDING_WINDOW
    return Player.objects.filter(discord_id=None, approved=False, created_at__gte=since).count()


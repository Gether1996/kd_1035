"""The bot's buttons (Gether 20. 10. 2026: "vieme do discord správy pridať button 'schváliť', že by som to schválil
cez bota rovno jedným tlačidlom?").

The message about a new player (newcomers.message) carries a "Schváliť" button when DISCORD_PUBLIC_KEY is set. A click
is an HTTP POST from Discord to /api/discord/interactions/ (the application's Interactions Endpoint URL, set in the
Developer Portal), signed with the application's Ed25519 key:

- an unsigned or badly signed request = 401 (Discord itself checks that when the URL is saved),
- PING (Discord checking the URL) = PONG,
- the button = only a Discord ID from DISCORD_ADMIN_IDS may approve (like the guard, accounts/guard.py); the player is
  approved like with the switch on /hraci (Player.approval_changed – the player's welcome DM), and the message is
  rewritten in place: "Schválený", no button.

The button's custom_id names the player and is signed with DJANGO_SECRET_KEY: development and production share the
Discord application, so a button sent by a dev PC (another key) never approves a production player with the same ID.
"""

import hashlib
import hmac
import json
import logging
import time

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from django.conf import settings
from django.http import HttpResponse, HttpResponseNotFound, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from .models import Player

log = logging.getLogger(__name__)

# Discord: interaction and response types, the button and the action row, an answer only the clicker sees
PING, COMPONENT = 1, 3
PONG, REPLY, UPDATE_MESSAGE = 1, 4, 7
EPHEMERAL = 64
APPROVE = 'approve'
# an older signed request is refused (a replay)
MAX_AGE = 300


def enabled() -> bool:
    return bool(settings.DISCORD_PUBLIC_KEY)


def _tag(action: str, player_id: int) -> str:
    raw = hmac.new(settings.SECRET_KEY.encode(), f'{action}:{player_id}'.encode(), hashlib.sha256).hexdigest()
    return raw[:20]


def approve_id(player: Player) -> str:
    """The custom_id of the "Schváliť" button of this player (at most 100 characters)."""
    return f'{APPROVE}:{player.pk}:{_tag(APPROVE, player.pk)}'


def player_of(custom_id: str) -> Player | None | bool:
    """The player of a signed custom_id; False = not this site's button (another key, a forged one), None = deleted."""
    try:
        action, pk, tag = custom_id.split(':')
        pk = int(pk)
    except ValueError:
        return False
    if action != APPROVE or not hmac.compare_digest(tag, _tag(action, pk)):
        return False
    return Player.objects.select_related('user').filter(pk=pk).first()


def verified(request) -> bool:
    signature = request.headers.get('X-Signature-Ed25519', '')
    timestamp = request.headers.get('X-Signature-Timestamp', '')
    try:
        key = Ed25519PublicKey.from_public_bytes(bytes.fromhex(settings.DISCORD_PUBLIC_KEY))
        key.verify(bytes.fromhex(signature), timestamp.encode() + request.body)
    except (ValueError, InvalidSignature):
        return False
    try:
        return abs(time.time() - int(timestamp)) <= MAX_AGE
    except ValueError:
        return False


def reply(text: str) -> JsonResponse:
    """An answer only the one who clicked sees; the message stays as it was."""
    return JsonResponse({'type': REPLY, 'data': {'content': text, 'flags': EPHEMERAL}})


@csrf_exempt
@require_POST
def interactions(request):
    if not enabled():
        return HttpResponseNotFound()
    if not verified(request):
        return HttpResponse('invalid request signature', status=401)
    try:
        body = json.loads(request.body)
    except ValueError:
        return HttpResponse(status=400)
    if not isinstance(body, dict):
        return HttpResponse(status=400)
    if body.get('type') == PING:
        return JsonResponse({'type': PONG})
    if body.get('type') != COMPONENT:
        return reply('Tomuto web nerozumie.')

    # in a DM Discord sends `user`, on a server `member.user`
    user = body.get('user') or (body.get('member') or {}).get('user') or {}
    clicker = str(user.get('id', ''))
    if clicker not in {str(i) for i in settings.DISCORD_ADMIN_IDS if i}:
        log.warning('Discord button refused: %s is not a superadmin', clicker)
        return reply('Schvaľovať môže iba superadmin.')
    custom_id = str((body.get('data') or {}).get('custom_id', ''))
    player = player_of(custom_id)
    if player is False:
        return reply('Toto tlačidlo nepatrí tomuto webu (napr. správa z vývojového PC).')

    # imported here: newcomers imports this module for the button
    from .newcomers import message

    if player is None:
        return reply('Hráč už na webe nie je.')
    # approved meanwhile (on /hraci, or the button of another superadmin's message): the message only catches up
    if not player.approved:
        player.approved = True
        player.save(update_fields=['approved'] + player.approval_changed(False))
        log.info('Player %s approved from Discord by %s', player.pk, clicker)
    return JsonResponse({'type': UPDATE_MESSAGE, 'data': {**message(player), 'allowed_mentions': {'parse': []}}})

"""Private messages from the kingdom's Discord bot (stdlib only, like discord_oauth.py).

The bot is the same Discord application as the sign-in, with a bot user added (DISCORD_BOT_TOKEN). It can write to
a player only when they share a server with it and allow direct messages from that server's members.
"""

import json
import urllib.error
import urllib.request

from django.conf import settings

from .discord_oauth import API, DISCORD_ID, USER_AGENT

# Discord error code: the user blocks DMs or shares no server with the bot
CANNOT_MESSAGE_USER = 50007


class BotError(Exception):
    """Discord refused or did not answer. The message never contains the token.

    temporary: rate limit, server error or no answer – worth trying again in a moment (the worker does, next tick).
    """

    def __init__(self, message: str, temporary: bool = False):
        super().__init__(message)
        self.temporary = temporary


def enabled() -> bool:
    return bool(settings.DISCORD_BOT_TOKEN)


def _post(path: str, payload: dict) -> dict:
    request = urllib.request.Request(
        f'{API}{path}',
        data=json.dumps(payload).encode(),
        headers={
            'Authorization': f'Bot {settings.DISCORD_BOT_TOKEN}',
            'Content-Type': 'application/json',
            'User-Agent': USER_AGENT,
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            data = json.load(response)
    except urllib.error.HTTPError as exc:
        raise _error(exc) from exc
    except OSError as exc:  # URLError, timeout, connection reset
        raise BotError(f'Discord je nedostupný: {exc}', temporary=True) from exc
    except ValueError as exc:
        raise BotError('Discord vrátil neplatnú odpoveď') from exc
    if not isinstance(data, dict):
        raise BotError('Discord vrátil neplatnú odpoveď')
    return data


def _error(exc: urllib.error.HTTPError) -> BotError:
    raw = exc.read()[:300]
    try:
        body = json.loads(raw)
    except ValueError:
        body = {}
    if not isinstance(body, dict):
        body = {}
    if exc.code == 429:
        # the worker never waits here: it pauses Discord for the rest of the round and retries on the next tick
        return BotError(f'Discord limit (429), skúsiť o {body.get("retry_after", "?")} s', temporary=True)
    if body.get('code') == CANNOT_MESSAGE_USER:
        return BotError('Hráč nemá povolené súkromné správy alebo nie je na Discord serveri s botom.')
    return BotError(f'Discord odpovedal {exc.code}: {raw.decode(errors="replace")}', temporary=exc.code >= 500)


def send_dm(discord_id: str, message: dict) -> None:
    """Opens (or reuses) the DM channel with the user and posts `message` (content/embeds) into it."""
    if not enabled():
        raise BotError('DISCORD_BOT_TOKEN nie je nastavený v .env')
    channel = _post('/users/@me/channels', {'recipient_id': discord_id}).get('id')
    if not isinstance(channel, str) or not DISCORD_ID.fullmatch(channel):
        raise BotError('Discord nevrátil kanál pre súkromnú správu')
    _post(f'/channels/{channel}/messages', {**message, 'allowed_mentions': {'parse': []}})

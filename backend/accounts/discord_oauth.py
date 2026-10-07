"""Sign in with Discord: OAuth2 authorization code flow, scope identify (stdlib only, like kingdom/discord.py).

identify = ID, username, display name and avatar. No e-mail, no list of servers.
"""

import base64
import json
import re
import urllib.error
import urllib.request
from urllib.parse import urlencode

from django.conf import settings

AUTHORIZE_URL = 'https://discord.com/oauth2/authorize'
API = 'https://discord.com/api/v10'
# Discord rejects the default Python user agent
USER_AGENT = 'KD1035Bot (https://github.com/Gether1996/kd_1035, 1.0)'
DISCORD_ID = re.compile(r'[0-9]{5,24}')


class OAuthError(Exception):
    """Discord refused or did not answer. The message never contains a token."""


def login_enabled() -> bool:
    return bool(settings.DISCORD_CLIENT_ID and settings.DISCORD_CLIENT_SECRET)


def authorize_url(state: str, redirect_uri: str) -> str:
    query = urlencode(
        {
            'response_type': 'code',
            'client_id': settings.DISCORD_CLIENT_ID,
            'scope': 'identify',
            'state': state,
            'redirect_uri': redirect_uri,
            # players who already allowed the app are sent straight back (first sign-in still asks)
            'prompt': 'none',
        }
    )
    return f'{AUTHORIZE_URL}?{query}'


def _call(request: urllib.request.Request) -> dict:
    request.add_header('User-Agent', USER_AGENT)
    request.add_header('Accept', 'application/json')
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            data = json.load(response)
    except urllib.error.HTTPError as exc:
        # error bodies carry codes like {"error": "invalid_grant"}, never the token
        body = exc.read()[:200].decode(errors='replace')
        raise OAuthError(f'Discord odpovedal {exc.code}: {body}') from exc
    except OSError as exc:  # URLError, timeout, connection reset
        raise OAuthError(f'Discord je nedostupný: {exc}') from exc
    except ValueError as exc:
        raise OAuthError('Discord vrátil neplatnú odpoveď') from exc
    if not isinstance(data, dict):
        raise OAuthError('Discord vrátil neplatnú odpoveď')
    return data


def exchange_code(code: str, redirect_uri: str) -> str:
    """The code from the callback → access token (client credentials via HTTP Basic, body form-encoded)."""
    credentials = base64.b64encode(f'{settings.DISCORD_CLIENT_ID}:{settings.DISCORD_CLIENT_SECRET}'.encode()).decode()
    request = urllib.request.Request(
        f'{API}/oauth2/token',
        data=urlencode({'grant_type': 'authorization_code', 'code': code, 'redirect_uri': redirect_uri}).encode(),
        headers={'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': f'Basic {credentials}'},
        method='POST',
    )
    token = _call(request).get('access_token')
    if not isinstance(token, str) or not token:
        raise OAuthError('Discord nevrátil access token')
    return token


def fetch_user(token: str) -> dict:
    """The signed-in Discord user: {'id', 'username', 'global_name', 'avatar', …}."""
    request = urllib.request.Request(f'{API}/users/@me', headers={'Authorization': f'Bearer {token}'})
    data = _call(request)
    if not isinstance(data.get('id'), str) or not DISCORD_ID.fullmatch(data['id']) or not data.get('username'):
        raise OAuthError('Discord vrátil neúplný profil')
    return data

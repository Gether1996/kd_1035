"""Browser/phone notifications through the Web Push protocol (pywebpush + VAPID keys from .env).

The browser gives the site an endpoint at its push service (Google, Mozilla, Apple, Microsoft) and two keys; the
worker encrypts the message with them and posts it to the endpoint. The push service never sees the content.
"""

import json
from urllib.parse import urlsplit

from django.conf import settings
from pywebpush import WebPushException, webpush

from .models import PushSubscription

# endpoints are accepted only at the browsers' push services – the worker posts to them, so a player must not be
# able to point it at an arbitrary address
PUSH_HOSTS = ('fcm.googleapis.com', 'push.services.mozilla.com', 'notify.windows.com', 'push.apple.com')
# failed sends in a row before a subscription is dropped
MAX_FAILURES = 5


class PushError(Exception):
    def __init__(self, message: str, gone: bool = False):
        super().__init__(message)
        # the browser withdrew the subscription (404/410) – delete it
        self.gone = gone


def enabled() -> bool:
    return bool(settings.VAPID_PUBLIC_KEY and settings.VAPID_PRIVATE_KEY)


def public_key() -> str:
    """For the browser's applicationServerKey; '' while push is not configured."""
    return settings.VAPID_PUBLIC_KEY if enabled() else ''


def allowed_endpoint(url: str) -> bool:
    try:
        parts = urlsplit(url)
        port = parts.port
    except ValueError:  # e.g. a port that is not a number
        return False
    host = (parts.hostname or '').lower()
    return (
        parts.scheme == 'https'
        and not parts.username
        and not parts.password
        and port in (None, 443)
        and any(host == h or host.endswith('.' + h) for h in PUSH_HOSTS)
    )


def send(subscription: PushSubscription, payload: dict, ttl: int) -> None:
    """Encrypts and posts one notification. `ttl` = seconds the push service keeps it for an offline device."""
    try:
        webpush(
            subscription_info={
                'endpoint': subscription.endpoint,
                'keys': {'p256dh': subscription.p256dh, 'auth': subscription.auth},
            },
            data=json.dumps(payload),
            vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims={'sub': settings.VAPID_SUBJECT},
            ttl=ttl,
            timeout=10,
            headers={'Urgency': 'high'},
        )
    except WebPushException as exc:
        status = exc.status_code
        raise PushError(f'Push služba odpovedala {status or "chybou"}', gone=status in (404, 410)) from exc
    except Exception as exc:  # network errors, a malformed key stored for the subscription
        raise PushError(f'Push sa nepodaril: {type(exc).__name__}') from exc

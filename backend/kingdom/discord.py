"""Posting event notifications to a Discord channel through a webhook (no bot, no OAuth)."""

import json
import logging
import urllib.error
import urllib.request
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from .models import EventNotification

log = logging.getLogger(__name__)

GOLD = 0xF5C451
# a notification the worker could not send for this long is not sent at all (worker was down)
MAX_DELAY = timedelta(hours=6)


class DiscordError(Exception):
    """`temporary`: Discord is down, slow or busy (timeout, 5xx, 429) – the notification is tried again on the next tick
    (until MAX_DELAY); otherwise (deleted webhook, bad payload) it is marked failed."""

    def __init__(self, message: str, temporary: bool = False):
        super().__init__(message)
        self.temporary = temporary


def mention_role_id(notification: EventNotification) -> str:
    """The role to ping: the row's own ID → its event's ID → DISCORD_EVENT_ROLE_ID; '' = no ping."""
    if not notification.mention_role:
        return ''
    event = notification.event
    return notification.mention_role_id or (event.mention_role_id if event else '') or settings.DISCORD_EVENT_ROLE_ID


def build_payload(notification: EventNotification) -> dict:
    role = mention_role_id(notification)
    embed = {
        'title': notification.title[:256],
        'description': notification.message[:4096],
        'color': GOLD,
        'timestamp': notification.send_at.isoformat(),
        'footer': {'text': 'KD 1035 · CZ/SK'},
    }
    if notification.event_start:
        # Discord renders <t:…> in every reader's own time zone; R = "in 2 hours"
        unix = int(notification.event_start.timestamp())
        embed['fields'] = [{'name': 'Začiatok', 'value': f'<t:{unix}:F> · <t:{unix}:R>'}]
    guide = notification.event.guide if notification.event else None
    if guide and guide.is_published and settings.SITE_URL:
        embed['url'] = f'{settings.SITE_URL}{guide.get_absolute_url()}'
    payload = {
        'username': 'Kingdom 1035',
        'content': f'<@&{role}>' if role else '',
        'allowed_mentions': {'parse': [], 'roles': [role] if role else []},
        'embeds': [embed],
    }
    if settings.SITE_URL:
        payload['avatar_url'] = f'{settings.SITE_URL}/icons/icon-192.png'
    return payload


def send(payload: dict, url: str) -> None:
    request = urllib.request.Request(
        f'{url}?wait=true',
        data=json.dumps(payload).encode(),
        headers={
            'Content-Type': 'application/json',
            # Discord rejects the default Python user agent
            'User-Agent': 'KD1035Bot (https://github.com/Gether1996/kd_1035, 1.0)',
        },
        method='POST',
    )
    try:
        # short: the admin's "Odoslať hneď" waits for it inside a gunicorn request
        with urllib.request.urlopen(request, timeout=8) as response:
            response.read()
    except urllib.error.HTTPError as exc:
        body = exc.read()[:300].decode(errors='replace')
        raise DiscordError(f'Discord odpovedal {exc.code}: {body}', temporary=exc.code >= 500 or exc.code == 429) from exc
    except urllib.error.URLError as exc:
        raise DiscordError(f'Discord je nedostupný: {exc.reason}', temporary=True) from exc
    except TimeoutError as exc:
        raise DiscordError('Discord neodpovedal včas', temporary=True) from exc


def post(notification: EventNotification) -> None:
    url = settings.DISCORD_WEBHOOK_URL
    if not url:
        raise DiscordError('DISCORD_WEBHOOK_URL nie je nastavená v .env')
    send(build_payload(notification), url)


class Busy(Exception):
    """Discord is temporarily unavailable – the worker stops this tick and tries again on the next one."""


def deliver(notification: EventNotification, retry: bool = False) -> bool:
    """Sends one pending or failed notification and stores the outcome. Returns True on success.

    The row is claimed first (a conditional update), so the worker and the admin's "Odoslať hneď" never post it twice;
    the outcome is written with an update, so a row deleted meanwhile (replan) breaks nothing. `retry`: a temporary
    Discord error puts it back to pending and raises Busy (the worker tries again later) instead of marking it failed.
    """
    rows = EventNotification.objects.filter(pk=notification.pk)
    claimed = rows.filter(status__in=[EventNotification.Status.PENDING, EventNotification.Status.FAILED]).update(
        status=EventNotification.Status.SENT, sent_at=timezone.now(), error=''
    )
    if not claimed:
        return False  # sent, cancelled or deleted meanwhile
    try:
        post(notification)
    except DiscordError as exc:
        log.warning('Discord notification %s failed: %s', notification.pk, exc)
        if retry and exc.temporary:
            rows.update(status=EventNotification.Status.PENDING, sent_at=None, error=str(exc))
            raise Busy(str(exc)) from exc
        rows.update(status=EventNotification.Status.FAILED, sent_at=None, error=str(exc))
        return False
    return True


def send_due(now=None) -> int:
    """Sends every pending notification whose time has come. Returns how many were processed.

    A row cancelled or sent (admin) while the loop runs is skipped – deliver() claims each row first. While Discord is
    temporarily down the tick stops and the rest waits for the next one; past MAX_DELAY a row is given up.
    """
    now = now or timezone.now()
    due = EventNotification.objects.filter(status=EventNotification.Status.PENDING, send_at__lte=now)
    count = 0
    for notification in due.order_by('send_at'):
        if notification.send_at < now - MAX_DELAY:
            reason = notification.error or 'worker v tom čase nebežal'
            missed = EventNotification.objects.filter(pk=notification.pk, status=EventNotification.Status.PENDING)
            if missed.update(status=EventNotification.Status.FAILED, error=f'Zmeškaná – {reason}'[:500]):
                count += 1
            continue
        try:
            if deliver(notification, retry=True):
                count += 1
        except Busy:
            break
    return count

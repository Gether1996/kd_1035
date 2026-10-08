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
    pass


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
        with urllib.request.urlopen(request, timeout=15) as response:
            response.read()
    except urllib.error.HTTPError as exc:
        body = exc.read()[:300].decode(errors='replace')
        raise DiscordError(f'Discord odpovedal {exc.code}: {body}') from exc
    except urllib.error.URLError as exc:
        raise DiscordError(f'Discord je nedostupný: {exc.reason}') from exc


def post(notification: EventNotification) -> None:
    url = settings.DISCORD_WEBHOOK_URL
    if not url:
        raise DiscordError('DISCORD_WEBHOOK_URL nie je nastavená v .env')
    send(build_payload(notification), url)


def deliver(notification: EventNotification) -> bool:
    """Sends one notification and stores the outcome. Returns True on success."""
    try:
        post(notification)
    except DiscordError as exc:
        notification.status = EventNotification.Status.FAILED
        notification.error = str(exc)
        log.warning('Discord notification %s failed: %s', notification.pk, exc)
    else:
        notification.status = EventNotification.Status.SENT
        notification.sent_at = timezone.now()
        notification.error = ''
    notification.save(update_fields=['status', 'sent_at', 'error'])
    return notification.status == EventNotification.Status.SENT


def send_due(now=None) -> int:
    """Sends every pending notification whose time has come. Returns how many were processed.

    A row cancelled while the loop runs is skipped; one cancelled during its own HTTP call still goes out.
    """
    now = now or timezone.now()
    due = EventNotification.objects.filter(status=EventNotification.Status.PENDING, send_at__lte=now)
    count = 0
    for notification in due.order_by('send_at'):
        # the admin may have cancelled it since the query (every send before it is an HTTP call)
        if not EventNotification.objects.filter(pk=notification.pk, status=EventNotification.Status.PENDING).exists():
            continue
        if notification.send_at < now - MAX_DELAY:
            notification.status = EventNotification.Status.FAILED
            notification.error = 'Zmeškaná – worker v tom čase nebežal.'
            notification.save(update_fields=['status', 'error'])
        else:
            deliver(notification)
        count += 1
    return count

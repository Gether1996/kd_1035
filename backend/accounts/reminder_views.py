"""The signed-in player's event reminders (/api/me/…), sent as a Discord DM from the bot.

Only players signed in with Discord (session + CSRF like /api/auth/me/). Players see and pick only active events
shown on the web; the worker sends the reminders (reminders.py).
"""

import logging
from datetime import UTC, timedelta

from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.views.decorators.cache import never_cache
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import SAFE_METHODS, BasePermission
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle

from kingdom.event_icons import icon_url
from kingdom.events import overlapping, upcoming
from kingdom.models import KingdomEvent

from . import discord_bot
from .models import EventReminder, Player, SentReminder
from .reminders import test_message
from .serializers import OffsetsSerializer, ReminderSettingsSerializer
from .views import player_of

log = logging.getLogger(__name__)


class IsPlayer(BasePermission):
    """Signed in with Discord – anonymous visitors and admins signed in with a password (no Player) get 403."""

    def has_permission(self, request, view):
        return player_of(request.user) is not None


class WriteThrottle(UserRateThrottle):
    """Changes per player (every chip on /pripomienky saves at once). The cache is per process, so it is a soft
    limit."""

    scope = 'reminders'
    rate = '60/minute'

    def allow_request(self, request, view):
        return request.method in SAFE_METHODS or super().allow_request(request, view)


class TestMessageThrottle(UserRateThrottle):
    """The test DM button: 3 per 10 minutes per player, with its own history (scope) apart from WriteThrottle."""

    scope = 'reminder_test'
    rate = '3/10m'

    def parse_rate(self, rate):
        # DRF reads only the unit ('m'); '3/10m' = 3 requests per 10 minutes
        num, period = rate.split('/')
        return int(num), int(period[:-1] or 1) * {'s': 1, 'm': 60, 'h': 3600}[period[-1]]


def last_delivery(player: Player) -> dict | None:
    """The player's newest personal reminder (any event): did it reach them? A row still being sent (no result
    yet) does not count."""
    row = (
        SentReminder.objects.filter(player=player)
        .filter(Q(ok=True) | ~Q(error=''))
        .order_by('-sent_at', '-pk')
        .only('ok', 'error', 'sent_at')
        .first()
    )
    if not row:
        return None
    return {
        'ok': row.ok,
        'blocked': not row.ok and row.error == discord_bot.BLOCKED_MESSAGE,
        'at': row.sent_at.astimezone(UTC).isoformat().replace('+00:00', 'Z'),
    }


def visible_events():
    return KingdomEvent.objects.filter(is_active=True, show_on_web=True)


def next_start(event: KingdomEvent, now):
    dates = upcoming(event, count=1, now=now)
    return dates[0] if dates else None


def iso(moment):
    return moment.astimezone(UTC).isoformat().replace('+00:00', 'Z')


def running_until(event: KingdomEvent, now):
    """End of the irregular event's run going on right now (Alliance Mobilization mid-week), else None – without it
    /pripomienky would say "termín oznámime" while the calendar says "Prebieha"."""
    if not event.irregular or not event.duration_minutes:
        return None
    begin = next(overlapping(event, now, now + timedelta(microseconds=1)), None)
    return begin + timedelta(minutes=event.duration_minutes) if begin and begin <= now else None


def event_data(event: KingdomEvent, offsets: list | None, start, now=None) -> dict:
    end = None if start else running_until(event, now or timezone.now())
    return {
        'id': event.pk,
        'name_sk': event.name_sk,
        'name_cs': event.name_cs,
        'icon': icon_url(event.icon),
        'next_start': iso(start) if start else None,
        # an irregular event without a next date that is running now: its end
        'running_until': iso(end) if end else None,
        'repeat_days': event.repeat_days,
        # 0 = no end; the website shows the clock only for a short irregular event
        'duration_minutes': event.duration_minutes,
        # no fixed cycle: next_start is null until leadership sets the next date
        'irregular': event.irregular,
        'offered': event.player_reminders or [],
        'offsets': offsets,
    }


@never_cache
@api_view(['GET', 'PATCH'])
@permission_classes([IsPlayer])
@throttle_classes([WriteThrottle])
def reminders(request):
    """GET: channels + events with the player's choice, soonest first. PATCH: {discord?, lang?}."""
    player = request.user.player
    if request.method == 'PATCH':
        form = ReminderSettingsSerializer(player, data=request.data, partial=True)
        form.is_valid(raise_exception=True)
        form.save()
        return Response({'discord': player.remind_discord, 'lang': player.lang})

    now = timezone.now()
    chosen = dict(player.event_reminders.values_list('event_id', 'offsets'))
    # soonest first; events without another start are left out, except irregular ones (players pick them in advance)
    starts = [(next_start(event, now), event) for event in visible_events()]
    planned = sorted((pair for pair in starts if pair[0]), key=lambda pair: pair[0])
    waiting = sorted((pair for pair in starts if not pair[0] and pair[1].irregular), key=lambda pair: pair[1].name_sk)
    events = [event_data(event, chosen.get(event.pk), start, now) for start, event in planned + waiting]
    return Response(
        {
            'discord': player.remind_discord,
            'discord_available': discord_bot.enabled(),
            'lang': player.lang,
            'events': events,
            # null = no reminder sent yet (the log keeps 30 days)
            'last_delivery': last_delivery(player),
        }
    )


@never_cache
@api_view(['POST'])
@permission_classes([IsPlayer])
@throttle_classes([TestMessageThrottle])
def test_dm(request):
    """Sends the player a test DM right now. Nothing is stored; the answer says whether the bot can reach them:
    {ok: true} | {ok: false, reason: 'blocked' (not on the server / DMs off) | 'unavailable' (no bot, Discord down)}."""
    player = request.user.player
    if not discord_bot.enabled():
        return Response({'ok': False, 'reason': 'unavailable'})
    try:
        discord_bot.send_dm(player.discord_id, test_message(player.lang))
    except discord_bot.BotError as exc:
        # the player's ID only – no Discord ID or name in the log
        log.warning('Test DM for player %s failed: %s', player.pk, exc)
        return Response({'ok': False, 'reason': 'blocked' if exc.blocked else 'unavailable'})
    return Response({'ok': True})


@never_cache
@api_view(['PUT', 'DELETE'])
@permission_classes([IsPlayer])
@throttle_classes([WriteThrottle])
def event_reminder(request, event_id):
    """PUT {offsets: [60, 10]} subscribes or changes the times, DELETE unsubscribes. 404 for events players
    cannot see."""
    player = request.user.player
    event = get_object_or_404(visible_events(), pk=event_id)
    if request.method == 'DELETE':
        player.event_reminders.filter(event=event).delete()
        return Response(status=204)
    data = OffsetsSerializer(data=request.data)
    data.is_valid(raise_exception=True)
    offsets = data.validated_data['offsets']
    EventReminder.objects.update_or_create(player=player, event=event, defaults={'offsets': offsets})
    return Response(event_data(event, offsets, next_start(event, timezone.now())))

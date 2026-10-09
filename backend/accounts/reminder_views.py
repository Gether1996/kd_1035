"""The signed-in player's event reminders (/api/me/…), sent as a Discord DM from the bot.

Only players signed in with Discord (session + CSRF like /api/auth/me/). Players see and pick only active events
shown on the web; the worker sends the reminders (reminders.py).
"""

from datetime import UTC

from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.views.decorators.cache import never_cache
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import SAFE_METHODS, BasePermission
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle

from kingdom.event_icons import icon_url
from kingdom.events import upcoming
from kingdom.models import KingdomEvent

from . import discord_bot
from .models import EventReminder
from .serializers import OffsetsSerializer, ReminderSettingsSerializer
from .views import player_of


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


def visible_events():
    return KingdomEvent.objects.filter(is_active=True, show_on_web=True)


def next_start(event: KingdomEvent, now):
    dates = upcoming(event, count=1, now=now)
    return dates[0] if dates else None


def event_data(event: KingdomEvent, offsets: list | None, start) -> dict:
    return {
        'id': event.pk,
        'name_sk': event.name_sk,
        'name_cs': event.name_cs,
        'icon': icon_url(event.icon),
        'next_start': start.astimezone(UTC).isoformat().replace('+00:00', 'Z') if start else None,
        'repeat_days': event.repeat_days,
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
    events = [event_data(event, chosen.get(event.pk), start) for start, event in planned + waiting]
    return Response(
        {
            'discord': player.remind_discord,
            'discord_available': discord_bot.enabled(),
            'lang': player.lang,
            'events': events,
        }
    )


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

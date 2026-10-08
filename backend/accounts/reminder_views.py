"""The signed-in player's event reminders and notification channels (/api/me/…).

Only players signed in with Discord (session + CSRF like /api/auth/me/). Players see and pick only active events
shown on the web; the worker sends the reminders (reminders.py).
"""

from datetime import UTC

from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.views.decorators.cache import never_cache
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import SAFE_METHODS, BasePermission
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle

from kingdom.event_icons import icon_url
from kingdom.events import upcoming
from kingdom.models import KingdomEvent

from . import discord_bot, push
from .models import EventReminder, PushSubscription
from .serializers import OffsetsSerializer, PushSubscriptionSerializer, ReminderSettingsSerializer
from .views import player_of

# browsers per player; registering one more drops the oldest
MAX_DEVICES = 10


class IsPlayer(BasePermission):
    """Signed in with Discord – anonymous visitors and admins signed in with a password (no Player) get 403."""

    def has_permission(self, request, view):
        return player_of(request.user) is not None


class WriteThrottle(UserRateThrottle):
    """Changes per player (every chip on /ucet saves at once). The cache is per process, so it is a soft limit."""

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
            'push_key': push.public_key(),
            'push_devices': player.push_subscriptions.count(),
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


@never_cache
@api_view(['POST', 'DELETE'])
@permission_classes([IsPlayer])
@throttle_classes([WriteThrottle])
def push_subscription(request):
    """POST: this browser's subscription (upsert – an endpoint used by another player before moves to this one).
    DELETE {endpoint}: notifications off on this browser."""
    player = request.user.player
    if request.method == 'DELETE':
        endpoint = request.data.get('endpoint') if isinstance(request.data, dict) else None
        if not isinstance(endpoint, str) or not endpoint:
            raise ValidationError({'endpoint': 'Chýba adresa.'})
        player.push_subscriptions.filter(endpoint=endpoint).delete()
        return Response({'push_devices': player.push_subscriptions.count()})

    data = PushSubscriptionSerializer(data=request.data)
    data.is_valid(raise_exception=True)
    keys = data.validated_data['keys']
    _, created = PushSubscription.objects.update_or_create(
        endpoint=data.validated_data['endpoint'],
        defaults={'player': player, 'p256dh': keys['p256dh'], 'auth': keys['auth'], 'failures': 0},
    )
    stale = list(player.push_subscriptions.order_by('-created_at', '-pk').values_list('pk', flat=True)[MAX_DEVICES:])
    PushSubscription.objects.filter(pk__in=stale).delete()
    return Response({'push_devices': player.push_subscriptions.count()}, status=201 if created else 200)

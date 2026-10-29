"""The superadmin's reminders in the Discord channel, set like the players' own (/pripomienky → Kanál, Gether
29. 10. 2026: "notifikácie nastaviteľné podobne ako pre hráča … do channelu s @everyone, napr. 10 min pred eventom").

They are the event's own channel reminders (`KingdomEvent.reminders` + `notify_discord`, sent through the webhook by
the worker), so the admin and the calendar's editor show the same times. GET /api/events/channel/ lists the active
events, PUT /api/events/channel/<id>/ {offsets, everyone?} sets the times (and switches the channel on), PATCH
{everyone} only the @everyone ping, DELETE switches the channel off (the times stay for the admin). Superusers only.
"""

from django.conf import settings
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.views.decorators.cache import never_cache
from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts.reminder_views import event_data, next_start
from accounts.serializers import OffsetsSerializer

from . import events
from .manage_api import IsSuperuser
from .models import REMINDER_CHOICES, KingdomEvent, lead_order

OFFERED = [minutes for minutes, _ in REMINDER_CHOICES]


class EveryoneSerializer(serializers.Serializer):
    everyone = serializers.BooleanField()


def channel_offsets(event: KingdomEvent) -> list | None:
    """The times the channel is reminded of, largest first; None = the event posts nothing in the channel."""
    if not event.notify_discord or not event.reminders:
        return None
    return sorted(set(event.reminders), key=lead_order, reverse=True)


def channel_data(event: KingdomEvent, now) -> dict:
    return {
        **event_data(event, channel_offsets(event), next_start(event, now), now),
        'offered': OFFERED,
        'everyone': event.mention_everyone,
    }


@never_cache
@api_view(['GET'])
@permission_classes([IsSuperuser])
def channel(request):
    """Every active event (also one hidden on the web), soonest first, irregular ones without a date after them."""
    now = timezone.now()
    starts = [(next_start(event, now), event) for event in KingdomEvent.objects.filter(is_active=True)]
    planned = sorted((pair for pair in starts if pair[0]), key=lambda pair: pair[0])
    waiting = sorted((pair for pair in starts if not pair[0] and pair[1].irregular), key=lambda pair: pair[1].name_sk)
    return Response(
        {
            # without the webhook nothing is planned – the page says so
            'webhook': bool(settings.DISCORD_WEBHOOK_URL),
            'events': [channel_data(event, now) for _, event in planned + waiting],
        }
    )


@never_cache
@api_view(['PUT', 'PATCH', 'DELETE'])
@permission_classes([IsSuperuser])
def channel_event(request, pk):
    event = get_object_or_404(KingdomEvent.objects.filter(is_active=True), pk=pk)
    before = (event.notify_discord, list(event.reminders or []))
    if request.method == 'DELETE':
        event.notify_discord = False
    elif request.method == 'PATCH':
        data = EveryoneSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        event.mention_everyone = data.validated_data['everyone']
    else:
        data = OffsetsSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        event.reminders = data.validated_data['offsets']
        event.notify_discord = True
        if 'everyone' in request.data:
            everyone = EveryoneSerializer(data=request.data)
            everyone.is_valid(raise_exception=True)
            event.mention_everyone = everyone.validated_data['everyone']
    event.save(update_fields=['notify_discord', 'reminders', 'mention_everyone', 'updated_at'])
    # new times or the channel on/off: the planned rows follow; @everyone is read when a message is sent
    if (event.notify_discord, list(event.reminders or [])) != before:
        events.replan(event)
    if request.method == 'DELETE':
        return Response(status=204)
    return Response(channel_data(event, timezone.now()))

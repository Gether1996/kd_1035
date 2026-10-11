"""The signed-in player's one-off alarms (/api/me/alarms/), sent as a Discord DM by the worker (alarms.py).

Same rules as the event reminders: players signed in with Discord only, session + CSRF, the write throttle.
"""

from datetime import timedelta

from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.views.decorators.cache import never_cache
from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.response import Response

from .models import MAX_ALARM_DAYS, MAX_ALARMS, Alarm
from .reminder_views import IsPlayer, WriteThrottle, iso

# "remind me … before": up to a day
MAX_LEAD = 24 * 60


class AlarmSerializer(serializers.Serializer):
    """POST {target: ISO time of the thing, lead: minutes before it (0 = at that time), note: short text}."""

    target = serializers.DateTimeField()
    lead = serializers.IntegerField(min_value=0, max_value=MAX_LEAD, default=0)
    note = serializers.CharField(max_length=100, allow_blank=True, default='', trim_whitespace=True)

    def validate(self, data):
        now = timezone.now()
        remind_at = data['target'] - timedelta(minutes=data['lead'])
        if data['target'] > now + timedelta(days=MAX_ALARM_DAYS):
            raise serializers.ValidationError({'target': 'too_far'})
        # a minute ahead at least – the worker checks every 30 s
        if remind_at < now + timedelta(minutes=1):
            raise serializers.ValidationError({'target': 'too_soon'})
        data['remind_at'] = remind_at
        return data


def alarm_data(alarm: Alarm) -> dict:
    return {
        'id': alarm.pk,
        'note': alarm.note,
        'target': iso(alarm.target_at),
        'remind_at': iso(alarm.remind_at),
    }


@never_cache
@api_view(['GET', 'POST'])
@permission_classes([IsPlayer])
@throttle_classes([WriteThrottle])
def alarms(request):
    """GET: the player's waiting alarms, soonest first. POST: a new one (at most MAX_ALARMS waiting)."""
    player = request.user.player
    waiting = player.alarms.filter(sent_at__isnull=True)
    if request.method == 'POST':
        form = AlarmSerializer(data=request.data)
        form.is_valid(raise_exception=True)
        if waiting.count() >= MAX_ALARMS:
            return Response({'detail': 'limit', 'max': MAX_ALARMS}, status=400)
        data = form.validated_data
        alarm = Alarm.objects.create(
            player=player, note=data['note'], target_at=data['target'], remind_at=data['remind_at']
        )
        return Response(alarm_data(alarm), status=201)
    return Response({'alarms': [alarm_data(a) for a in waiting.order_by('remind_at')], 'max': MAX_ALARMS})


@never_cache
@api_view(['DELETE'])
@permission_classes([IsPlayer])
@throttle_classes([WriteThrottle])
def alarm(request, alarm_id):
    """DELETE: cancels one of the player's waiting alarms; someone else's is 404."""
    get_object_or_404(request.user.player.alarms.filter(sent_at__isnull=True), pk=alarm_id).delete()
    return Response(status=204)

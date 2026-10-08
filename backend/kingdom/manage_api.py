"""Event management for superusers straight in the calendar (/kalendar): the same rules as the admin.

/api/events/manage/ (GET list + everything the editor needs, POST create), /api/events/manage/<id>/ (GET, PATCH,
DELETE) and /api/events/manage/<id>/date/ (PUT/DELETE the next date of an irregular event). Session + CSRF like the
rest of the site's API. Every change that alters the schedule plans the Discord reminders again (events.replan).
"""

import copy
from datetime import UTC, datetime, timedelta

from django.conf import settings
from django.core.exceptions import NON_FIELD_ERRORS
from django.core.exceptions import ValidationError as ModelValidationError
from django.db.models import Count
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.views.decorators.cache import never_cache
from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.settings import api_settings

from guides.models import Guide

from . import event_icons, events
from .admin import PLAN_FIELDS
from .event_templates import NOT_PLANNED
from .models import REMINDER_CHOICES, KingdomEvent
from .views import iso


class IsSuperuser(BasePermission):
    """Events are managed by superusers only (the same as in the admin)."""

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.is_superuser


def basis_zone(event: KingdomEvent):
    return events.LOCAL_TZ if event.time_basis == KingdomEvent.TimeBasis.LOCAL else UTC


def planned(event: KingdomEvent, now) -> datetime | None:
    """The next start, or the one running now; None = nothing ahead (an irregular event waiting for a date)."""
    return next(events.overlapping(event, now), None)


def unplanned(event: KingdomEvent) -> datetime:
    """A start in the past at the usual hour: the calendar shows irregular events only from now on."""
    zone = basis_zone(event)
    return datetime.combine(NOT_PLANNED.date(), event.starts_at.astimezone(zone).time(), tzinfo=zone)


class EventSerializer(serializers.ModelSerializer):
    icon = serializers.ChoiceField(choices=[], required=False, allow_blank=True)
    guide = serializers.PrimaryKeyRelatedField(
        queryset=Guide.objects.filter(category='eventy'), allow_null=True, required=False
    )

    class Meta:
        model = KingdomEvent
        fields = [
            'id',
            'name_sk',
            'name_cs',
            'icon',
            'message',
            'starts_at',
            'duration_minutes',
            'repeat_days',
            'until',
            'irregular',
            'time_basis',
            'reminders',
            'notify_discord',
            'mention_role',
            'mention_role_id',
            'show_on_web',
            'player_reminders',
            'guide',
            'is_active',
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['icon'].choices = event_icons.choices()

    def validate(self, attrs):
        # the model's own checks (twins, a cycle on an irregular event, {end}…) on a copy with the new values
        event = copy.copy(self.instance) if self.instance else KingdomEvent()
        for key, value in attrs.items():
            setattr(event, key, value)
        if event.notify_discord and not event.reminders:
            raise ValidationError({'reminders': 'Vyber aspoň jednu pripomienku alebo vypni posielanie na Discord.'})
        try:
            event.clean()
        except ModelValidationError as error:
            detail = serializers.as_serializer_error(error)
            if NON_FIELD_ERRORS in detail:  # the twin check: DRF's own key, like its other form-wide errors
                detail[api_settings.NON_FIELD_ERRORS_KEY] = detail.pop(NON_FIELD_ERRORS)
            raise ValidationError(detail) from error
        return attrs

    def save(self, **kwargs):
        before = None if self.instance is None else {name: getattr(self.instance, name) for name in PLAN_FIELDS}
        event = super().save(**kwargs)
        # like the admin: only a change of the schedule or the Discord settings drops and re-plans the reminders
        if before is None or any(getattr(event, name) != value for name, value in before.items()):
            events.replan(event)
        return event

    def to_representation(self, event):
        data = super().to_representation(event)
        now = timezone.now()
        start = planned(event, now)
        return {
            **data,
            'starts_at': iso(event.starts_at),
            'icon_url': event_icons.icon_url(event.icon),
            'next_start': iso(start) if start else None,
            # the hour it usually starts at, in its own time basis: 20:00 in Bratislava, 00:00 UTC…
            'usual_time': event.starts_at.astimezone(basis_zone(event)).strftime('%H:%M'),
            'players': getattr(event, 'players_count', None),
        }


def managed_events():
    return KingdomEvent.objects.select_related('guide').annotate(players_count=Count('subscriptions', distinct=True))


def answer(event: KingdomEvent, code=status.HTTP_200_OK) -> Response:
    # fresh annotations (players) after a save
    return Response(EventSerializer(managed_events().get(pk=event.pk)).data, status=code)


@never_cache
@api_view(['GET', 'POST'])
@permission_classes([IsSuperuser])
def event_list(request):
    """GET: all events (inactive drafts too) and what the editor offers; POST: a new event."""
    if request.method == 'POST':
        editor = EventSerializer(data=request.data)
        editor.is_valid(raise_exception=True)
        return answer(editor.save(), status.HTTP_201_CREATED)
    rows = sorted(
        EventSerializer(managed_events(), many=True).data,
        # active first, then by the next date (those without one at the end), then by name
        key=lambda e: (not e['is_active'], e['next_start'] is None, e['next_start'] or '', e['name_sk']),
    )
    guides = Guide.objects.filter(category='eventy').order_by('order', 'title_sk')
    return Response(
        {
            'events': rows,
            'icons': [
                {'slug': slug, 'label': label, 'url': event_icons.icon_url(slug)}
                for slug, label in event_icons.choices()
                if slug
            ],
            'guides': [
                {'id': g.pk, 'title_sk': g.title_sk, 'title_cs': g.title_cs, 'published': g.is_published}
                for g in guides
            ],
            'reminder_choices': [minutes for minutes, _ in REMINDER_CHOICES],
            # without a webhook nothing goes to the Discord channel (the editor says so)
            'webhook': bool(settings.DISCORD_WEBHOOK_URL),
        }
    )


@never_cache
@api_view(['GET', 'PATCH', 'DELETE'])
@permission_classes([IsSuperuser])
def event_detail(request, pk):
    event = get_object_or_404(managed_events(), pk=pk)
    if request.method == 'DELETE':
        # its Discord notifications and the players' choices go with it (CASCADE)
        event.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    if request.method == 'PATCH':
        editor = EventSerializer(event, data=request.data, partial=True)
        editor.is_valid(raise_exception=True)
        event = editor.save()
    return answer(event)


@never_cache
@api_view(['PUT', 'DELETE'])
@permission_classes([IsSuperuser])
def irregular_date(request, pk):
    """PUT {start: ISO 8601}: the next date of an irregular event (it replaces the one set before);
    DELETE: no date (players keep their choice for the next one). Discord reminders are planned again."""
    event = get_object_or_404(managed_events().filter(is_active=True, irregular=True), pk=pk)
    now = timezone.now()
    if request.method == 'PUT':
        data = request.data if isinstance(request.data, dict) else {}
        try:
            start = parse_datetime(str(data.get('start', '')))
        except ValueError:  # well-formed, but no such day or hour
            start = None
        if not start or not timezone.is_aware(start):
            raise ValidationError({'start': 'Dátum a čas v ISO 8601 s časovým pásmom.'})
        if start <= now or start > now + timedelta(days=366):
            raise ValidationError({'start': 'Termín musí byť v budúcnosti, najviac o rok.'})
        event.starts_at = start.astimezone(UTC)
    elif planned(event, now):
        event.starts_at = unplanned(event)
    else:
        return answer(event)
    try:
        event.full_clean()
    except ModelValidationError as error:
        raise ValidationError({'start': [m for messages in error.message_dict.values() for m in messages]}) from error
    event.save()
    events.replan(event, now=now)
    return answer(event)

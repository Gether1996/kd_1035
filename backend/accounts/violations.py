"""Violations of the kingdom's rules – strikes on /priestupky (Gether 18. 11. 2026, after the talk on Discord: "pridáš hráčovi
prvú žltú kartu … zvýši sa mu trest, ak po čase, tak znova reset", "všetko dynamické a nastaviteľné, nové špeciálne
oprávnenie … len niektorým"; the same day: "1, 2 a tretí strike … prvý priestupok 1 týždeň kick z Ali, druhý kumulatívny
2 týždne, tretí zero, ale po skončení priestupku sa to resetuje za X času", a board every player sees).

A violation is a day and a reason. Its strike is counted each time from the player's violations and ViolationSettings,
never stored: a violation before the penalty of the one before ended + `reset_days` is the next strike, a later one the
first again; past the last strike the last one again. The player's standing: the strike of the last violation until
`reset_on` (the end of its penalty + reset_days), its penalty until `penalty_until` (its `days` from the violation).

/api/violations/             GET the rules and every approved player (and anyone with a violation) with the standing;
                             POST {player, day, reason} – a new violation. The superadmin and the approved players with
                             Player.violations_manager
/api/violations/<id>/        DELETE a violation – the same
/api/violations/settings/    PUT {reset_days, keep_days, description, levels: [{name, penalty, days}]} – the superadmin
/api/violations/board/       GET the description, the strikes and the players with a strike now (no reasons) – every
                             approved player
"""

import logging
from datetime import date, timedelta

from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.views.decorators.cache import never_cache
from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import BasePermission
from rest_framework.response import Response

from .models import MAX_VIOLATION_LEVELS, VIOLATION_DAYS_MAX, Player, Violation, ViolationSettings
from .reminder_views import WriteThrottle, iso
from .views import player_of

log = logging.getLogger(__name__)


class IsViolationsManager(BasePermission):
    """The superadmin, or an approved player with the switch "Priestupky" (a taken-back approval cuts it off)."""

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        player = player_of(request.user)
        return player is not None and player.violations_manager and player.approved


class IsMember(BasePermission):
    """The board: every approved player, and the superadmin."""

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        player = player_of(request.user)
        return request.user.is_superuser or (player is not None and player.approved)


class IsSuperuser(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.is_superuser


def level_of(levels: list[dict], n: int) -> dict:
    """The n-th strike (1 = the first); past the last one the last one again"""
    return levels[min(n, len(levels)) - 1] if levels else {'name': '', 'penalty': '', 'days': 0}


def penalty_end(levels: list[dict], n: int, day: date) -> date:
    """The last day of the penalty of strike n given on `day` – the day itself when it has no time (a zero)"""
    days = int(level_of(levels, n).get('days') or 0)
    return day + timedelta(days=days)


def standing(cards: list[Violation], rules: ViolationSettings, today: date) -> dict:
    """Every violation with its strike, and where the player stands today. `cards` in their order (day, then added).

    A penalty keeps running when a later strike has a shorter one (a zero during a 2-week kick): the end of the
    penalties is the latest of them, and the reset counts from there."""
    reset = timedelta(days=rules.reset_days)
    numbered, level, ends = [], 0, None
    # the penalty that runs the longest: (its last day, its strike)
    longest = None
    for card in cards:
        level = level + 1 if ends is not None and card.day <= ends + reset else 1
        numbered.append((card, level))
        end = penalty_end(rules.levels, level, card.day)
        ends = end if ends is None else max(ends, end)
        if int(level_of(rules.levels, level).get('days') or 0) and (longest is None or end >= longest[0]):
            longest = (end, level)
    current = {'level': 0, 'penalty_until': None, 'penalty': '', 'reset_on': None}
    if numbered and ends + reset >= today:
        current['level'] = numbered[-1][1]
        # the first day without the strike
        current['reset_on'] = (ends + reset + timedelta(days=1)).isoformat()
    if longest and longest[0] >= today:
        current['penalty_until'] = longest[0].isoformat()
        current['penalty'] = level_of(rules.levels, longest[1]).get('penalty', '')
    return {'cards': numbered, **current}


def card_data(card: Violation, level: int) -> dict:
    by = card.added_by
    return {
        'id': card.pk,
        'day': card.day.isoformat(),
        'reason': card.reason,
        'level': level,
        'added_by': (by.ingame_name or by.name) if by else '',
        'created_at': iso(card.created_at),
    }


def player_data(player: Player, rules: ViolationSettings, today: date) -> dict:
    state = standing(list(player.violations.all()), rules, today)
    return {
        'id': player.pk,
        'name': player.ingame_name or player.name,
        'avatar_url': player.avatar_url,
        'level': state['level'],
        'penalty_until': state['penalty_until'],
        # the text of the running penalty – maybe of an earlier strike than the current one
        'penalty': state['penalty'],
        'reset_on': state['reset_on'],
        # the newest first
        'cards': [card_data(card, n) for card, n in reversed(state['cards'])],
    }


def rules_data(rules: ViolationSettings) -> dict:
    return {
        'reset_days': rules.reset_days,
        'keep_days': rules.keep_days,
        'description': rules.description,
        'levels': rules.levels,
    }


def invert(day: str | None) -> int:
    """a later day first when sorting up"""
    return -date.fromisoformat(day).toordinal() if day else 0


def with_violations():
    return Player.objects.filter(user__is_active=True).prefetch_related('violations__added_by')


class CardSerializer(serializers.Serializer):
    player = serializers.IntegerField()
    day = serializers.DateField()
    reason = serializers.CharField(max_length=300, trim_whitespace=True)

    def validate_day(self, value):
        if value > timezone.localdate():
            raise serializers.ValidationError('future')
        return value


class LevelSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=60, trim_whitespace=True)
    penalty = serializers.CharField(max_length=200, trim_whitespace=True, allow_blank=True, required=False, default='')
    days = serializers.IntegerField(min_value=0, max_value=VIOLATION_DAYS_MAX, required=False, default=0)


class RulesSerializer(serializers.Serializer):
    reset_days = serializers.IntegerField(min_value=0, max_value=VIOLATION_DAYS_MAX)
    keep_days = serializers.IntegerField(min_value=30, max_value=VIOLATION_DAYS_MAX)
    description = serializers.CharField(max_length=2000, allow_blank=True, required=False, default='', trim_whitespace=True)
    levels = LevelSerializer(many=True, min_length=1, max_length=MAX_VIOLATION_LEVELS)


@never_cache
@api_view(['GET', 'POST'])
@permission_classes([IsViolationsManager])
@throttle_classes([WriteThrottle])
def violations(request):
    rules = ViolationSettings.load()
    today = timezone.localdate()
    if request.method == 'POST':
        form = CardSerializer(data=request.data)
        form.is_valid(raise_exception=True)
        data = form.validated_data
        # only for a player of the kingdom (approved) – a fresh account waiting for approval has none
        player = Player.objects.filter(pk=data['player'], approved=True, user__is_active=True).first()
        if player is None:
            return Response({'player': 'unknown'}, status=400)
        Violation.objects.create(player=player, day=data['day'], reason=data['reason'], added_by=player_of(request.user))
        log.info('Violation for player %s by user %s', player.pk, request.user.pk)
        return Response(player_data(player, rules, today), status=status.HTTP_201_CREATED)

    players = with_violations().filter(Q(approved=True) | Q(violations__isnull=False)).distinct()
    rows = sorted((player_data(p, rules, today) for p in players), key=lambda row: row['name'].casefold())
    return Response({'rules': rules_data(rules), 'players': rows, 'edit_rules': request.user.is_superuser})


@never_cache
@api_view(['GET'])
@permission_classes([IsMember])
def board(request):
    """The Prehľad tab: who has a strike now and until when – names and strikes only, never the reasons."""
    rules = ViolationSettings.load()
    today = timezone.localdate()
    rows = []
    for player in with_violations().filter(violations__isnull=False).distinct():
        row = player_data(player, rules, today)
        if row['level']:
            rows.append(
                {key: row[key] for key in ('id', 'name', 'avatar_url', 'level', 'penalty_until', 'penalty', 'reset_on')}
            )
    # the penalties running first, the highest strike and the longest penalty on top
    rows.sort(key=lambda r: (r['penalty_until'] is None, -r['level'], invert(r['penalty_until']), r['name'].casefold()))
    return Response(
        {
            'description': rules.description,
            'reset_days': rules.reset_days,
            'levels': rules.levels,
            'players': rows,
            'manage': IsViolationsManager().has_permission(request, None),
        }
    )


@never_cache
@api_view(['DELETE'])
@permission_classes([IsViolationsManager])
@throttle_classes([WriteThrottle])
def violation(request, violation_id):
    card = get_object_or_404(Violation, pk=violation_id)
    player = card.player
    card.delete()
    log.info('Violation %s of player %s deleted by user %s', violation_id, player.pk, request.user.pk)
    return Response(player_data(player, ViolationSettings.load(), timezone.localdate()))


@never_cache
@api_view(['PUT'])
@permission_classes([IsSuperuser])
@throttle_classes([WriteThrottle])
def violation_settings(request):
    form = RulesSerializer(data=request.data)
    form.is_valid(raise_exception=True)
    rules = ViolationSettings.load()
    rules.reset_days = form.validated_data['reset_days']
    rules.keep_days = form.validated_data['keep_days']
    rules.description = form.validated_data['description']
    rules.levels = [dict(level) for level in form.validated_data['levels']]
    rules.save()
    return Response(rules_data(rules))


def prune(today=None) -> int:
    """Violations older than keep_days go (the worker, once a day; the privacy page says so)."""
    today = today or timezone.localdate()
    # read, never created here – a worker tick must not change the database (the git snapshot)
    rules = ViolationSettings.objects.filter(pk=1).first()
    keep = rules.keep_days if rules else ViolationSettings._meta.get_field('keep_days').default
    return Violation.objects.filter(day__lt=today - timedelta(days=keep)).delete()[0]

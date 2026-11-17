"""Violations of the kingdom's rules – yellow cards on /priestupky (Gether 18. 11. 2026, after the talk on Discord: "pridáš
hráčovi prvú žltú kartu, tá platí X času, pokiaľ pridáš ďalšiu do tohto času, zvýši sa mu trest, ak po čase, tak znova
reset", "všetko dynamické a nastaviteľné, nové špeciálne oprávnenie … len niektorým").

A card is a day and a reason. Its level is counted each time from the player's cards and ViolationSettings, never
stored: a card within `window_days` of the one before goes one level up, a longer gap starts again at the first level.
The player's standing: the level of the last card while it is valid (`window_days` from it), the penalty of that level
until its `days` run out. Seen and written by the superadmin and the players with Player.violations_manager (approved);
the rules only by the superadmin.

/api/violations/             GET the rules and every approved player (and anyone with a card) with the standing;
                             POST {player, day, reason} – a new card
/api/violations/<id>/        DELETE a card
/api/violations/settings/    PUT {window_days, keep_days, levels: [{name, penalty, days}]} – the superadmin
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


class IsSuperuser(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.is_superuser


def level_of(levels: list[dict], n: int) -> dict:
    """The n-th level (1 = the first); past the last one the last one again"""
    return levels[min(n, len(levels)) - 1] if levels else {'name': '', 'penalty': '', 'days': 0}


def standing(cards: list[Violation], rules: ViolationSettings, today: date) -> dict:
    """Every card with its level, and where the player stands today. `cards` in their order (day, then added)."""
    window = timedelta(days=rules.window_days)
    numbered, level, before = [], 0, None
    for card in cards:
        level = level + 1 if before is not None and card.day - before <= window else 1
        numbered.append((card, level))
        before = card.day
    current = {'level': 0, 'active_until': None, 'penalty_until': None}
    if numbered:
        last, n = numbered[-1]
        until = last.day + window
        if until >= today:
            current['level'] = n
            current['active_until'] = until.isoformat()
        days = int(level_of(rules.levels, n).get('days') or 0)
        if days and last.day + timedelta(days=days) >= today:
            current['penalty_until'] = (last.day + timedelta(days=days)).isoformat()
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
        'active_until': state['active_until'],
        'penalty_until': state['penalty_until'],
        # the newest first
        'cards': [card_data(card, n) for card, n in reversed(state['cards'])],
    }


def rules_data(rules: ViolationSettings) -> dict:
    return {'window_days': rules.window_days, 'keep_days': rules.keep_days, 'levels': rules.levels}


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
    window_days = serializers.IntegerField(min_value=1, max_value=VIOLATION_DAYS_MAX)
    keep_days = serializers.IntegerField(min_value=30, max_value=VIOLATION_DAYS_MAX)
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
        # a card only for a player of the kingdom (approved) – a fresh account waiting for approval has none
        player = Player.objects.filter(pk=data['player'], approved=True, user__is_active=True).first()
        if player is None:
            return Response({'player': 'unknown'}, status=400)
        Violation.objects.create(player=player, day=data['day'], reason=data['reason'], added_by=player_of(request.user))
        log.info('Violation for player %s by user %s', player.pk, request.user.pk)
        return Response(player_data(player, rules, today), status=status.HTTP_201_CREATED)

    players = (
        Player.objects.filter(user__is_active=True)
        .filter(Q(approved=True) | Q(violations__isnull=False))
        .distinct()
        .prefetch_related('violations__added_by')
    )
    rows = sorted((player_data(p, rules, today) for p in players), key=lambda row: row['name'].casefold())
    return Response({'rules': rules_data(rules), 'players': rows, 'edit_rules': request.user.is_superuser})


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
    rules.window_days = form.validated_data['window_days']
    rules.keep_days = form.validated_data['keep_days']
    rules.levels = [dict(level) for level in form.validated_data['levels']]
    rules.save()
    return Response(rules_data(rules))


def prune(today=None) -> int:
    """Cards older than keep_days go (the worker, once a day; the privacy page says so)."""
    today = today or timezone.localdate()
    # read, never created here – a worker tick must not change the database (the git snapshot)
    rules = ViolationSettings.objects.filter(pk=1).first()
    keep = rules.keep_days if rules else ViolationSettings._meta.get_field('keep_days').default
    return Violation.objects.filter(day__lt=today - timedelta(days=keep)).delete()[0]

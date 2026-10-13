"""/vyhodnocovanie – the KvK evaluation of the superadmin (Gether 13. 10. 2026: the "KVK Requirements" spreadsheet on
the web). The page computes everything itself from the marches the players clicked together and the variables saved
here, so a changed variable shows at once; the server keeps the variables and what the superadmin writes down about
a player (power, acclaim reached, T4, a correction of the recommended power). The superuser and the players the
superuser lets in (Player.evaluator, a switch next to R4 – Gether 13. 10. 2026); those see only approved players."""

import json
import math
from decimal import Decimal

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.views.decorators.cache import never_cache
from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import BasePermission
from rest_framework.response import Response

from guides.pairs import check_rows, pair_rows, pairs_version, replace_pairs

from .kvk_views import march_data
from .models import APPROVED, EvaluationSettings, Player, PlayerEvaluation
from .reminder_views import WriteThrottle, iso
from .views import player_of

# the variables are a few hundred numbers and the inscription tier list: far below this
SETTINGS_MAX_BYTES = 64 * 1024
SETTINGS_MAX_DEPTH = 6


def clean_settings(value, depth=0):
    """Plain JSON only – objects with string keys, lists, strings, finite numbers, booleans and null – at most
    SETTINGS_MAX_DEPTH deep. Raises ValueError otherwise. The page checks the meaning of every value itself."""
    if depth > SETTINGS_MAX_DEPTH:
        raise ValueError('too deep')
    if isinstance(value, dict):
        for key, item in value.items():
            if not isinstance(key, str) or len(key) > 64:
                raise ValueError('key')
            clean_settings(item, depth + 1)
    elif isinstance(value, list):
        for item in value:
            clean_settings(item, depth + 1)
    elif isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError('number')
    elif isinstance(value, str):
        if len(value) > 200:
            raise ValueError('text')
    elif value is not None and not isinstance(value, (bool, int)):
        raise ValueError('type')
    return value


class CanEvaluate(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        if not user.is_authenticated:
            return False
        player = player_of(user)
        return user.is_superuser or bool(player and player.evaluator)


def visible_players(request):
    """Every active player for the superuser; the others see approved players only (an un-approved player's marches
    are the superuser's alone, Gether 12. 10. 2026)."""
    players = Player.objects.filter(user__is_active=True)
    return players if request.user.is_superuser else players.filter(APPROVED)


def record_of(player: Player) -> PlayerEvaluation | None:
    try:
        return player.evaluation
    except PlayerEvaluation.DoesNotExist:
        return None


def record_data(record: PlayerEvaluation | None) -> dict:
    return {
        'power': float(record.power) if record and record.power is not None else None,
        'acclaim': record.acclaim if record else None,
        't4': record.t4 if record else False,
        'power_bonus': float(record.power_bonus) if record else 0.0,
    }


def settings_data(row: EvaluationSettings) -> dict:
    # nothing saved yet: the page uses its defaults (the spreadsheet's constants); the commander pairs are a table of
    # their own (guides.CommanderPair – in the database, editable in the admin too, Gether 13. 10. 2026)
    rows = pair_rows()
    return {
        'settings': row.data or None,
        'updated_at': iso(row.updated_at) if row.data else None,
        'pairs': rows,
        'pairs_version': pairs_version(rows),
    }


@never_cache
@api_view(['GET'])
@permission_classes([CanEvaluate])
def evaluation(request):
    """The variables and every player with their marches and what was written down about them – for the superuser
    those not approved too (the page leaves them out unless asked), and players without a march."""
    players = (
        visible_players(request)
        .select_related('user', 'evaluation')
        .prefetch_related('marches')
    )
    rows = sorted(
        (
            {
                'id': p.pk,
                'name': p.name,
                'ingame_name': p.ingame_name,
                'avatar_url': p.avatar_url,
                'approved': p.may_post,
                'marches': [march_data(m) for m in p.marches.all()],
                **record_data(record_of(p)),
            }
            for p in players
        ),
        key=lambda p: (p['ingame_name'] or p['name']).casefold(),
    )
    return Response({**settings_data(EvaluationSettings.load()), 'players': rows})


@never_cache
@api_view(['PUT'])
@permission_classes([CanEvaluate])
@throttle_classes([WriteThrottle])
def evaluation_settings(request):
    """PUT {settings: {...}, pairs?: [[primary, secondary, points], …], pairs_version?} – the variables ({settings:
    null} goes back to the defaults) and, when the page changed it, the whole commander pair table; both or nothing.
    The table is saved only over the version the page loaded (pairs_version from GET): changed meanwhile in the admin
    or by another evaluator → 409 {pairs: 'stale'}. A commander a march cannot name → 400 {pairs: 'unknown', names}."""
    body = request.data if isinstance(request.data, dict) else {}
    value = body.get('settings')
    if value is not None and not isinstance(value, dict):
        return Response({'settings': 'object'}, status=400)
    try:
        clean_settings(value)
    except ValueError:
        return Response({'settings': 'invalid'}, status=400)
    if len(json.dumps(value)) > SETTINGS_MAX_BYTES:
        return Response({'settings': 'too_large'}, status=400)
    pairs = None
    if 'pairs' in body:
        try:
            pairs, unknown = check_rows(body['pairs'])
        except ValueError:
            return Response({'pairs': 'invalid'}, status=400)
        if unknown:
            return Response({'pairs': 'unknown', 'names': unknown}, status=400)
    with transaction.atomic():
        if pairs is not None and body.get('pairs_version') != pairs_version(pair_rows()):
            return Response({'pairs': 'stale'}, status=409)
        row = EvaluationSettings.load()
        row.data = value or {}
        row.save()
        if pairs is not None:
            replace_pairs(pairs)
    return Response(settings_data(row))


class RecordSerializer(serializers.Serializer):
    power = serializers.DecimalField(
        max_digits=6, decimal_places=1, min_value=Decimal(0), allow_null=True, required=False
    )
    acclaim = serializers.IntegerField(min_value=0, max_value=10**12, allow_null=True, required=False)
    t4 = serializers.BooleanField(required=False)
    power_bonus = serializers.DecimalField(
        max_digits=5, decimal_places=1, min_value=Decimal('-999.9'), max_value=Decimal('999.9'), required=False
    )

    def validate_t4(self, value):
        # a JSON boolean only, not "yes" or 1
        if type(self.initial_data.get('t4')) is not bool:
            raise serializers.ValidationError('bool')
        return value


def save_record(player: Player, values: dict) -> PlayerEvaluation:
    record = record_of(player) or PlayerEvaluation(player=player)
    for field, value in values.items():
        setattr(record, field, value)
    record.save()
    return record


@never_cache
@api_view(['PATCH'])
@permission_classes([CanEvaluate])
@throttle_classes([WriteThrottle])
def evaluation_player(request, player_id):
    """PATCH {power?, acclaim?, t4?, power_bonus?} – what the superadmin writes down about one player."""
    player = get_object_or_404(visible_players(request), pk=player_id)
    form = RecordSerializer(data=request.data)
    form.is_valid(raise_exception=True)
    if not form.validated_data:
        return Response({'detail': 'empty'}, status=400)
    return Response({'id': player.pk, **record_data(save_record(player, form.validated_data))})


# a paste of the whole kingdom fits easily
BULK_MAX = 500


@never_cache
@api_view(['PATCH'])
@permission_classes([CanEvaluate])
@throttle_classes([WriteThrottle])
def evaluation_players(request):
    """PATCH {players: [{id, power?, acclaim?, t4?, power_bonus?}, …]} – many players at once (the power of everyone
    pasted from a list). All or nothing: one wrong row or unknown player and nothing is saved."""
    items = request.data.get('players') if isinstance(request.data, dict) else None
    if not isinstance(items, list) or not 1 <= len(items) <= BULK_MAX:
        return Response({'players': 'list'}, status=400)
    if any(not isinstance(item, dict) or type(item.get('id')) is not int for item in items):
        return Response({'players': 'id'}, status=400)
    players = {p.pk: p for p in visible_players(request).filter(pk__in=[i['id'] for i in items])}
    changes = []
    for item in items:
        form = RecordSerializer(data={k: v for k, v in item.items() if k != 'id'})
        if item['id'] not in players or not form.is_valid() or not form.validated_data:
            return Response({'players': 'invalid', 'id': item['id']}, status=400)
        changes.append((players[item['id']], form.validated_data))
    with transaction.atomic():
        saved = [{'id': player.pk, **record_data(save_record(player, values))} for player, values in changes]
    return Response({'players': saved})

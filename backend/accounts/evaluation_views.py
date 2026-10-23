"""/vyhodnocovanie – the KvK evaluation of the superadmin (Gether 13. 10. 2026: the "KVK Requirements" spreadsheet on
the web). The page computes everything itself from the marches the players clicked together and the variables saved
here, so a changed variable shows at once; the server keeps the variables and what the superadmin writes down about
a player (power, T4, a correction of the recommended power). The superuser and the players the superuser lets in
(switches next to R4 – Gether 13. and 14. 10. 2026): Player.evaluation_settings opens the estimate and the variables,
the required acclaim the others published ("Požadovaný acclaim", read only) every approved player (Gether 23. 10.
2026, before the switch Player.evaluation_overview); those see only approved players. R4 (Player.kvk_reviewer) sees "Top 5 equip" – the best equipment and armaments of each player per
troop type (Gether 19. 10. 2026)."""

import json
import math
from decimal import Decimal

from django.db import transaction
from django.db.models import Prefetch
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.views.decorators.cache import never_cache
from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import BasePermission
from rest_framework.response import Response

from guides.formations import check_formations, formation_map, formations_version, replace_formations
from guides.pairs import check_rows, pair_rows, pairs_version, replace_pairs

from . import private_images
from .kvk_views import army_data, equipment_settings, march_data
from .models import APPROVED, EvaluationSettings, KvkSignup, March, Player, PlayerEvaluation
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


def allowed(request, *flags: str) -> bool:
    """The superuser, or an approved player the superuser gave one of these switches (Hráči on /ucet) – taking the
    approval back cuts the evaluation off too, the switches stay for a new approval"""
    user = request.user
    if not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    player = player_of(user)
    return bool(player and player.approved and any(getattr(player, flag) for flag in flags))


class CanEvaluate(BasePermission):
    """The estimate and the variables (Gether 14. 10. 2026: one switch): the players' marches and power, the pair
    table – reads and changes them, and publishes the required acclaim"""

    def has_permission(self, request, view):
        return allowed(request, 'evaluation_settings')


class CanSeeOverview(BasePermission):
    """The published required acclaim – every approved player and the superuser (Gether 23. 10. 2026: "každý schválený
    hráč bude na to vidieť"; before only the players with a switch of their own)"""

    def has_permission(self, request, view):
        player = player_of(request.user)
        return bool(request.user.is_authenticated and (request.user.is_superuser or (player and player.may_post)))


class CanReview(BasePermission):
    """R4 and the superuser (private_images.can_review) – Top 5 equip"""

    def has_permission(self, request, view):
        return private_images.can_review(request.user)


def visible_players(request):
    """Every active player for the superuser; the others see approved players only (an un-approved player's marches
    are the superuser's alone, Gether 12. 10. 2026)."""
    players = Player.objects.filter(user__is_active=True)
    return players if request.user.is_superuser else players.filter(APPROVED)


def approved_players():
    """The overview is the approved players' – for the superuser too (a player waiting is nobody's business yet)"""
    return Player.objects.filter(user__is_active=True).filter(APPROVED)


def record_of(player: Player) -> PlayerEvaluation | None:
    try:
        return player.evaluation
    except PlayerEvaluation.DoesNotExist:
        return None


def record_data(record: PlayerEvaluation | None) -> dict:
    return {
        'power': float(record.power) if record and record.power is not None else None,
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
        # the formations the commanders should lead with (guides.CommanderFormation, Gether 14. 10. 2026); its version
        # guards a save like the pairs'
        'formations': (formations := formation_map()),
        'formations_version': formations_version(formations),
        # what the players with the overview switch see now (the page tells what changed since)
        'overview': overview_data(row),
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
    """PUT {settings: {...}, pairs?: [[primary, secondary, points], …], pairs_version?, formations?: {commander:
    [formation, …]}, formations_version?} – the variables ({settings: null} goes back to the defaults) and, when the page changed them, the
    whole commander pair table and the commanders' formations; all or nothing. A commander a march cannot name in the
    formations → 400 {formations: 'unknown', names}; the formations changed meanwhile → 409 {formations: 'stale'}.
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
    formations = None
    if 'formations' in body:
        try:
            formations, unknown = check_formations(body['formations'])
        except ValueError:
            return Response({'formations': 'invalid'}, status=400)
        if unknown:
            return Response({'formations': 'unknown', 'names': unknown}, status=400)
    with transaction.atomic():
        if pairs is not None and body.get('pairs_version') != pairs_version(pair_rows()):
            return Response({'pairs': 'stale'}, status=409)
        if formations is not None and body.get('formations_version') != formations_version(formation_map()):
            return Response({'formations': 'stale'}, status=409)
        row = EvaluationSettings.load()
        row.data = value or {}
        row.save()
        if pairs is not None:
            replace_pairs(pairs)
        if formations is not None:
            replace_formations(formations)
    return Response(settings_data(row))


class RecordSerializer(serializers.Serializer):
    power = serializers.DecimalField(
        max_digits=6, decimal_places=1, min_value=Decimal(0), allow_null=True, required=False
    )
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
    """PATCH {power?, t4?, power_bonus?} – what the superadmin writes down about one player."""
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
    """PATCH {players: [{id, power?, t4?, power_bonus?}, …]} – many players at once (the power of everyone
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


# a march count and an acclaim the page can count: far above any real one
OVERVIEW_MAX_MARCHES = 20
OVERVIEW_MAX_ACCLAIM = 10**12
OVERVIEW_KEYS = ('id', 'marches', 'missing', 'required')
# the power and the power the counted marches carry, millions (Gether 14. 10. 2026: "kombinovaná aktuálna power /
# odporúčaná power"); null = not written down / no march counted
OVERVIEW_POWER = ('power', 'recommended')
OVERVIEW_MAX_POWER = 9999.9


def overview_row(item) -> dict | None:
    """{id, marches, missing, required, power, recommended} – whole numbers in range, the power in millions with one
    decimal or null; or None"""
    if not isinstance(item, dict) or set(item) != {*OVERVIEW_KEYS, *OVERVIEW_POWER}:
        return None
    if any(type(item[key]) is not int for key in OVERVIEW_KEYS):
        return None
    if not (0 <= item['marches'] <= OVERVIEW_MAX_MARCHES and 0 <= item['missing'] <= OVERVIEW_MAX_MARCHES):
        return None
    if not 0 <= item['required'] <= OVERVIEW_MAX_ACCLAIM:
        return None
    for key in OVERVIEW_POWER:
        value = item[key]
        if value is not None and (type(value) not in (int, float) or not 0 <= value <= OVERVIEW_MAX_POWER):
            return None
    return {
        **{key: item[key] for key in OVERVIEW_KEYS},
        **{key: None if item[key] is None else round(float(item[key]), 1) for key in OVERVIEW_POWER},
    }


def overview_data(row: EvaluationSettings) -> dict:
    return {'published_at': iso(row.overview_at) if row.overview_at else None, 'rows': row.overview}


@never_cache
@api_view(['GET', 'PUT'])
@permission_classes([CanSeeOverview])
@throttle_classes([WriteThrottle])
def evaluation_overview(request):
    """"Požadovaný acclaim" (Gether 14. 10. 2026: a plain overview for the players, nothing to edit).
    GET – what was published, approved players only (a player who left or lost the approval drops out), with the name
    and avatar; `you` marks the reader. The power and the recommended power as published (Gether 14. 10. 2026) – never
    the variables, the pairs or the marches.
    PUT {rows: [{id, marches, missing, required, power, recommended}, …]} – an evaluator publishes what the estimate counts now (the page
    computes it, the server cannot); approved players only, each once, all or nothing; [] = nothing published."""
    row = EvaluationSettings.load()
    if request.method == 'PUT':
        if not allowed(request, 'evaluation_settings'):
            return Response({'detail': 'evaluation_settings'}, status=403)
        items = request.data.get('rows') if isinstance(request.data, dict) else None
        if not isinstance(items, list) or len(items) > BULK_MAX:
            return Response({'rows': 'list'}, status=400)
        rows = [overview_row(item) for item in items]
        if any(r is None for r in rows):
            return Response({'rows': 'invalid'}, status=400)
        ids = [r['id'] for r in rows]
        known = set(approved_players().filter(pk__in=ids).values_list('pk', flat=True))
        if len(set(ids)) != len(ids) or known != set(ids):
            return Response({'rows': 'players'}, status=400)
        row.overview = rows
        row.overview_at = timezone.now() if rows else None
        row.save(update_fields=['overview', 'overview_at'])
        return Response(overview_data(row))
    published = [r for r in row.overview if isinstance(r, dict) and type(r.get('id')) is int]
    players = approved_players().select_related('user').in_bulk([r['id'] for r in published])
    rows = [
        {
            # the name in the game first, Discord as the fallback (like everywhere other players are shown)
            'id': p.pk,
            'name': p.ingame_name or p.name,
            'avatar_url': p.avatar_url,
            'marches': r['marches'],
            'missing': r['missing'],
            'required': r['required'],
            # rows published before the power column have none
            'power': r.get('power'),
            'recommended': r.get('recommended'),
            'you': p.user_id == request.user.pk,
        }
        for r in published
        if (p := players.get(r['id']))
    ]
    return Response({**overview_data(row), 'rows': rows})


# "Top 5 equip" ranks the open-field troop types only (Gether 19. 10. 2026: "budeme riešiť len inf, arch a cav")
EQUIPMENT_KINDS = ('infantry', 'cavalry', 'archer')


@never_cache
@api_view(['GET'])
@permission_classes([CanReview])
def evaluation_equipment(request):
    """"Top 5 equip" (Gether 19. 10. 2026, R4 only): every approved player with an infantry, cavalry or archer march
    or KvK sign-up (rally, garrison – "kto sa hodí najviac na rally / garrison"), with those – the page puts the best
    piece of each slot of all of a type together, with the strongest formation. Of the variables only what scores the
    equipment and the armaments goes along (never the pairs, the power or the acclaim)."""
    settings = equipment_settings()
    marches = March.objects.filter(kind__in=EQUIPMENT_KINDS).order_by('position')
    signups = KvkSignup.objects.filter(kind__in=EQUIPMENT_KINDS).order_by('role')
    players = (
        approved_players()
        .select_related('user')
        .prefetch_related(Prefetch('marches', queryset=marches), Prefetch('kvk_signups', queryset=signups))
    )
    rows = sorted(
        (
            {
                # the name in the game first, Discord as the fallback (like everywhere other players are shown)
                'id': p.pk,
                'name': p.ingame_name or p.name,
                'avatar_url': p.avatar_url,
                'marches': [march_data(m) for m in p.marches.all()],
                'signups': [
                    {'id': s.pk, 'role': s.role, 'kind': s.kind, **army_data(s)} for s in p.kvk_signups.all()
                ],
            }
            for p in players
        ),
        key=lambda p: p['name'].casefold(),
    )
    return Response({'settings': settings, 'players': [p for p in rows if p['marches'] or p['signups']]})

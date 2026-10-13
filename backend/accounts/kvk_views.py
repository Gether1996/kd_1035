"""KvK sign-ups (/api/kvk/…): players sign up for rally and / or garrison, each filled in exactly like a march (Gether
11. and 12. 10. 2026) – troop type, commanders with their skills, the build clicked together, armament bonuses – plus a
note; no screenshots since 12. 10. 2026. No rounds: a sign-up stays until the player or the superuser withdraws it; the
superuser only sets the heading (KvkSettings, e.g. the date of the next KvK) and picks the reviewers. Reviewers
(Player.kvk_reviewer, e.g. R4) and the superuser see every sign-up with the player's marches. Session + CSRF like the
rest of the player API.
"""

import logging
from decimal import Decimal

from django.db import transaction
from django.db.models import Count, Prefetch
from django.shortcuts import get_object_or_404
from django.views.decorators.cache import never_cache
from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import BasePermission
from rest_framework.response import Response

from . import private_images
from .army import BUILD_FIELDS, BuildSerializer, current_of
from .models import APPROVED, MARCH_STATS, KvkSettings, KvkSignup, March, Player, PlayerSettings
from .reminder_views import IsPlayer, WriteThrottle, iso
from .views import cannot_post, player_of

log = logging.getLogger(__name__)
ROLES = [role for role, _ in KvkSignup.Role.choices]


class IsReviewer(BasePermission):
    def has_permission(self, request, view):
        return private_images.can_review(request.user)


class IsSuperuser(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.is_superuser


# ---------------------------------------------------------------- data


def settings_data() -> dict:
    heading = KvkSettings.load()
    return {'title_sk': heading.title_sk, 'title_cs': heading.title_cs}


def army_data(army) -> dict:
    """The army of a march or a sign-up (ArmyFields): commanders with their skills, the armament bonuses (numbers with
    one decimal), the inscription counts and the build clicked together."""
    values = {field: getattr(army, field) for field in MARCH_STATS}
    values = {field: float(value) if isinstance(value, Decimal) else value for field, value in values.items()}
    return {
        'primary': army.primary,
        'secondary': army.secondary,
        'primary_skills': army.primary_skills,
        'secondary_skills': army.secondary_skills,
        **values,
        'gear': army.gear,
        'formation': army.formation,
        'inscriptions': army.inscriptions,
    }


def march_data(march: March) -> dict:
    return {'id': march.pk, 'position': march.position, 'kind': march.kind, **army_data(march)}


def signup_data(signup: KvkSignup, with_player=False) -> dict:
    data = {
        'id': signup.pk,
        'role': signup.role,
        'kind': signup.kind,
        **army_data(signup),
        'note': signup.note,
        'updated_at': iso(signup.updated_at),
    }
    if with_player:
        player = signup.player
        data['player'] = {
            'id': player.pk,
            'name': player.name,
            'ingame_name': player.ingame_name,
            'avatar_url': player.avatar_url,
            'discord_id': player.discord_id,
            'approved': player.may_post,
        }
        data['marches'] = [march_data(march) for march in player.marches.all()]
    return data


def signups_of(player: Player) -> list[KvkSignup]:
    return list(KvkSignup.objects.filter(player=player))


# ---------------------------------------------------------------- the player


class SignupSerializer(BuildSerializer):
    """PUT: the sign-up's form (in-game name, role, troops, commanders with skills, note); PATCH: its build and bonuses."""

    ingame_name = serializers.CharField(max_length=32, trim_whitespace=True)
    role = serializers.ChoiceField(choices=KvkSignup.Role.choices)
    kind = serializers.ChoiceField(choices=KvkSignup.Kind.choices)
    note = serializers.CharField(max_length=500, allow_blank=True, default='', trim_whitespace=True)

    def validate(self, data):
        # the primary commander is required, like in a march
        if not self.partial and not data.get('primary'):
            raise serializers.ValidationError({'primary': 'required'})
        return super().validate(data)


@never_cache
@api_view(['GET'])
def state(request):
    """The heading, the player's rally and garrison sign-ups and what the visitor may do. Anyone may ask (anonymous
    visitors get the heading only)."""
    player = player_of(request.user)
    mine = signups_of(player) if player else []
    return Response(
        {
            **settings_data(),
            'signups': {role: next((signup_data(s) for s in mine if s.role == role), None) for role in ROLES},
            'player': bool(player),
            'ingame_name': player.ingame_name if player else '',
            'approved': bool(player and player.may_post),
            'reviewer': private_images.can_review(request.user),
            'superuser': bool(request.user.is_authenticated and request.user.is_superuser),
        }
    )


@never_cache
@api_view(['PUT', 'PATCH', 'DELETE'])
@permission_classes([IsPlayer])
@throttle_classes([WriteThrottle])
def signup(request):
    """PUT {ingame_name, role, kind, primary, secondary?, primary_skills?, secondary_skills?, note?}: sign up as rally or
    garrison, or change that sign-up (the in-game name is saved on the player too). PATCH {role, gear?, formation?,
    inscriptions?, attack?, defense?, health?, damage?}: the build of that sign-up (404 without one). DELETE
    ?role=<rally|garrison>: withdraw that sign-up."""
    player = request.user.player
    if request.method == 'DELETE':
        role = request.query_params.get('role')
        if role not in ROLES:
            return Response({'role': 'invalid'}, status=400)
        KvkSignup.objects.filter(player=player, role=role).delete()
        return Response(status=204)
    if blocked := cannot_post(player):
        return blocked
    body = request.data if isinstance(request.data, dict) else {}
    role = body.get('role')
    saved = KvkSignup.objects.filter(player=player, role=role).first() if role in ROLES else None
    if request.method == 'PATCH':
        if not saved:
            return Response(status=404)
        # the build and the armament bonuses only – the form (commanders, skills, note…) goes with PUT
        build = {key: value for key, value in body.items() if key in BUILD_FIELDS or key in MARCH_STATS}
        form = SignupSerializer(data=build, partial=True, context={'current': current_of(saved)})
        form.is_valid(raise_exception=True)
        for field, value in form.validated_data.items():
            setattr(saved, field, value)
        saved.save()
        return Response(signup_data(saved))
    form = SignupSerializer(data=body, context={'current': current_of(saved), 'creating': saved is None})
    form.is_valid(raise_exception=True)
    data = form.validated_data
    with transaction.atomic():
        player.ingame_name = data.pop('ingame_name')
        player.save(update_fields=['ingame_name'])
        mine, _ = KvkSignup.objects.update_or_create(player=player, role=data.pop('role'), defaults=data)
    return Response(signup_data(mine))


# ---------------------------------------------------------------- reviewers


@never_cache
@api_view(['GET'])
@permission_classes([IsReviewer])
def all_signups(request):
    """Every sign-up with the player (name, in-game name, Discord ID for "Kontaktovať") and their marches. The sign-ups
    of players the superadmin has not approved (or un-approved) only the superuser sees, marked."""
    signups = KvkSignup.objects.select_related('player__user').prefetch_related('player__marches')
    if not request.user.is_superuser:
        signups = signups.filter(player__in=Player.objects.filter(APPROVED))
    rows = sorted(
        (signup_data(s, with_player=True) for s in signups),
        # by player, the rally sign-up before the garrison one (one card per player on /kvk)
        key=lambda s: ((s['player']['ingame_name'] or s['player']['name']).casefold(), s['role'] != 'rally'),
    )
    return Response({'signups': rows})


@never_cache
@api_view(['DELETE'])
@permission_classes([IsSuperuser])
@throttle_classes([WriteThrottle])
def delete_signup(request, signup_id):
    """The superuser withdraws someone's sign-up."""
    get_object_or_404(KvkSignup, pk=signup_id).delete()
    return Response(status=204)


class SettingsSerializer(serializers.Serializer):
    title_sk = serializers.CharField(max_length=80, allow_blank=True, trim_whitespace=True)
    title_cs = serializers.CharField(max_length=80, allow_blank=True, default='', trim_whitespace=True)


@never_cache
@api_view(['PUT'])
@permission_classes([IsSuperuser])
@throttle_classes([WriteThrottle])
def settings(request):
    """PUT {title_sk, title_cs?}: the heading of the sign-ups (e.g. the date of the next KvK)."""
    form = SettingsSerializer(data=request.data)
    form.is_valid(raise_exception=True)
    KvkSettings.objects.update_or_create(pk=1, defaults=form.validated_data)
    return Response(settings_data())


# ---------------------------------------------------------------- superuser: who sees the sign-ups


@never_cache
@api_view(['GET'])
@permission_classes([IsSuperuser])
def reviewers(request):
    """Every active player signed in with Discord: the reviewer flag (R4), the approval for marches and KvK sign-ups,
    when they first and last signed in, how many marches they have and which KvK sign-ups (Gether 13. 10. 2026: filters
    like on /marche)."""
    players = (
        Player.objects.filter(user__is_active=True)
        .select_related('user')
        .annotate(march_count=Count('marches', distinct=True))
        .prefetch_related(Prefetch('kvk_signups', queryset=KvkSignup.objects.only('player_id', 'role')))
    )
    rows = sorted(
        (
            {
                'id': p.pk,
                'name': p.name,
                'ingame_name': p.ingame_name,
                'avatar_url': p.avatar_url,
                'reviewer': p.kvk_reviewer,
                'approved': p.approved,
                'created_at': iso(p.created_at),
                'last_login': iso(p.user.last_login) if p.user.last_login else None,
                'marches': p.march_count,
                'kvk': sorted(signup.role for signup in p.kvk_signups.all()),
                'superuser': p.user.is_superuser,
            }
            for p in players
        ),
        key=lambda p: (p['ingame_name'] or p['name']).casefold(),
    )
    return Response({'players': rows, 'auto_approve': PlayerSettings.load().auto_approve})


@never_cache
@api_view(['PUT'])
@permission_classes([IsSuperuser])
@throttle_classes([WriteThrottle])
def auto_approve(request):
    """PUT {auto_approve: bool} – new players approved at their first sign-in, no Discord message (PlayerSettings)."""
    value = request.data.get('auto_approve') if isinstance(request.data, dict) else None
    if type(value) is not bool:
        return Response({'auto_approve': 'bool'}, status=400)
    PlayerSettings.objects.update_or_create(pk=1, defaults={'auto_approve': value})
    log.info('Auto-approve of new players: %s', value)
    return Response({'auto_approve': value})


@never_cache
@api_view(['PATCH'])
@permission_classes([IsSuperuser])
@throttle_classes([WriteThrottle])
def reviewer(request, player_id):
    """PATCH {reviewer?: bool, approved?: bool} – R4 (sees the sign-ups), approved (adds marches and sign-ups)."""
    player = get_object_or_404(Player, pk=player_id)
    body = request.data if isinstance(request.data, dict) else {}
    fields = {'reviewer': 'kvk_reviewer', 'approved': 'approved'}
    changes = {name: body[name] for name in fields if name in body}
    if not changes:
        return Response({'detail': 'reviewer or approved'}, status=400)
    for name, value in changes.items():
        if type(value) is not bool:
            return Response({name: 'bool'}, status=400)
        setattr(player, fields[name], value)
    player.save(update_fields=[fields[name] for name in changes])
    log.info('Player %s: %s', player.pk, changes)
    return Response({'id': player.pk, 'reviewer': player.kvk_reviewer, 'approved': player.approved})

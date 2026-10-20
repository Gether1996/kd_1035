"""KvK sign-ups (/api/kvk/…): players sign up for rally and / or garrison, each filled in exactly like a march (Gether
11. and 12. 10. 2026) – troop type, commanders with their skills, the build clicked together, armament bonuses – plus a
note; no screenshots since 12. 10. 2026. No rounds and no heading (Gether 20. 10. 2026): a sign-up stays until the
player or the superuser withdraws it; the superuser picks the reviewers. Reviewers
(Player.kvk_reviewer, e.g. R4) and the superuser see every sign-up with the player's marches. Session + CSRF like the
rest of the player API.
"""

import logging
from decimal import Decimal

from django.db import transaction
from django.db.models import Prefetch
from django.shortcuts import get_object_or_404
from django.views.decorators.cache import never_cache
from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import BasePermission
from rest_framework.response import Response

from . import private_images
from .army import BUILD_FIELDS, BuildSerializer, current_of
from .models import APPROVED, KVK_ONLINE, MARCH_STATS, KvkSignup, March, Player, PlayerSettings
from .pair_check import march_checker, over_caps
from .reminder_views import IsPlayer, WriteThrottle, iso
from .views import cannot_post, player_of

log = logging.getLogger(__name__)
ROLES = [role for role, _ in KvkSignup.Role.choices]
PROBLEMS = ('pair_problem', 'formation_problem', 'stats_problem')


class IsReviewer(BasePermission):
    def has_permission(self, request, view):
        return private_images.can_review(request.user)


class IsSuperuser(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.is_superuser


# ---------------------------------------------------------------- data


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
        # a bonus over its cap – red like on /marche (Gether 19. 10. 2026); the sign-up's own player, R4, the superuser
        'stats_problem': over_caps(signup),
        'note': signup.note,
        # the survey (Gether 20. 10. 2026): '' and [] for a sign-up from before it
        'budget': signup.budget,
        'online': signup.online,
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
    # the survey of the form (Gether 20. 10. 2026): how much into the KvK (one) and when online (one or more)
    budget = serializers.ChoiceField(choices=KvkSignup.Budget.choices)
    online = serializers.ListField(child=serializers.ChoiceField(choices=KVK_ONLINE), min_length=1)

    def validate_online(self, value):
        # each once, in the order of the form
        return [key for key in KVK_ONLINE if key in value]

    def validate(self, data):
        # the primary commander is required, like in a march
        if not self.partial and not data.get('primary'):
            raise serializers.ValidationError({'primary': 'required'})
        return super().validate(data)


@never_cache
@api_view(['GET'])
def state(request):
    """The player's rally and garrison sign-ups and what the visitor may do. Anyone may ask (anonymous visitors get
    nothing of their own)."""
    player = player_of(request.user)
    mine = signups_of(player) if player else []
    return Response(
        {
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
    """PUT {ingame_name, role, kind, primary, secondary?, primary_skills?, secondary_skills?, note?, budget, online}: sign up as rally or
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
        # one survey for both sign-ups (Gether 20. 10. 2026): the other one gets the same answers (its "upravené" stays)
        KvkSignup.objects.filter(player=player).exclude(pk=mine.pk).update(budget=mine.budget, online=mine.online)
    return Response(signup_data(mine))


# ---------------------------------------------------------------- reviewers


@never_cache
@api_view(['GET'])
@permission_classes([IsReviewer])
def all_signups(request):
    """Every sign-up with the player (name, in-game name, Discord ID for "Kontaktovať") and their marches. The sign-ups
    of players the superadmin has not approved (or un-approved) nobody sees, the superuser neither (Gether 20. 10. 2026)."""
    signups = (
        KvkSignup.objects.filter(player__in=Player.objects.filter(APPROVED))
        .select_related('player__user')
        .prefetch_related('player__marches')
    )
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


# ---------------------------------------------------------------- superuser: who sees the sign-ups


@never_cache
@api_view(['GET'])
@permission_classes([IsSuperuser])
def reviewers(request):
    """Every active player signed in with Discord: the reviewer flag (R4), the approval for marches and KvK sign-ups,
    when they first and last signed in, how many marches they have and which KvK sign-ups (Gether 13. 10. 2026: filters
    like on /marche), and `issues` – how many of their marches are red on /marche (a wrong pair or formation, a bonus
    over its cap, march_checker; read once for the whole list, the queries do not grow with the players)."""
    check = march_checker()
    players = (
        Player.objects.filter(user__is_active=True)
        .select_related('user')
        .prefetch_related(
            Prefetch('kvk_signups', queryset=KvkSignup.objects.only('player_id', 'role')),
            # only what the checker reads
            Prefetch(
                'marches',
                queryset=March.objects.only(
                    'player_id', 'kind', 'primary', 'secondary', 'formation', 'attack', 'defense', 'health', 'damage'
                ),
            ),
        )
    )
    rows = sorted(
        (
            {
                'id': p.pk,
                'name': p.name,
                'ingame_name': p.ingame_name,
                'avatar_url': p.avatar_url,
                'reviewer': p.kvk_reviewer,
                'evaluation_settings': p.evaluation_settings,
                'evaluation_overview': p.evaluation_overview,
                'approved': p.approved,
                # hidden in the list until "Zobraziť neaktívnych" (Gether 20. 10. 2026)
                'inactive': p.inactive,
                'created_at': iso(p.created_at),
                'last_login': iso(p.user.last_login) if p.user.last_login else None,
                'marches': len(p.marches.all()),
                # red on /marche (marchHasProblem in core/kvk-api.ts)
                'issues': sum(1 for march in p.marches.all() if any(map(check(march).get, PROBLEMS))),
                'kvk': sorted(signup.role for signup in p.kvk_signups.all()),
                'superuser': p.user.is_superuser,
                # without Discord: the superadmin gives a code for a new password, deletes one waiting (local_auth.py)
                'local': p.local,
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
    """PATCH {reviewer?: bool, approved?: bool, evaluation_settings?: bool, evaluation_overview?: bool, inactive?:
    bool} – R4 (sees the sign-ups), approved (adds marches and sign-ups), /vyhodnocovanie (the estimate and the
    variables) and its published required acclaim only (Gether 14. 10. 2026), and "Neaktívny" – hidden in the
    superadmin's list on /hraci, nothing else (Gether 20. 10. 2026)."""
    player = get_object_or_404(Player, pk=player_id)
    body = request.data if isinstance(request.data, dict) else {}
    fields = {
        'reviewer': 'kvk_reviewer',
        'approved': 'approved',
        'evaluation_settings': 'evaluation_settings',
        'evaluation_overview': 'evaluation_overview',
        'inactive': 'inactive',
    }
    changes = {name: body[name] for name in fields if name in body}
    if not changes:
        return Response({'detail': 'reviewer, approved, evaluation_settings, evaluation_overview or inactive'}, status=400)
    was_approved = player.approved
    for name, value in changes.items():
        if type(value) is not bool:
            return Response({name: 'bool'}, status=400)
        setattr(player, fields[name], value)
    # a newly approved player gets a bot DM that they can start (newcomers.send_welcomes)
    player.save(update_fields=[fields[name] for name in changes] + player.approval_changed(was_approved))
    log.info('Player %s: %s', player.pk, changes)
    return Response({'id': player.pk, **{name: getattr(player, field) for name, field in fields.items()}})

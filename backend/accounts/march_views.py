"""The player's marches on /marche ("Prehľad marchov", Gether 11. and 12. 10. 2026): up to MAX_MARCHES, each with a
type, the commander pair (army.py), the build clicked together (equipment, formation, inscriptions – guides/armory.py)
and the armament bonuses typed in its editor; the inscription counts follow from the inscriptions. No screenshot since
12. 10. 2026. The player edits them; the reviewers and the superuser see them next to the player's KvK sign-up.
Session + CSRF, players signed in with Discord.
"""

from django.db import transaction
from django.db.models import F, Q
from django.shortcuts import get_object_or_404
from django.views.decorators.cache import never_cache
from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import BasePermission
from rest_framework.response import Response

from . import private_images
from .army import BuildSerializer, current_of
from .kvk_views import march_data
from .models import APPROVED, MAX_MARCHES, March, Player
from .pair_check import march_checker
from .reminder_views import IsPlayer, WriteThrottle, iso
from .views import cannot_post, player_of


class MarchSerializer(BuildSerializer):
    kind = serializers.ChoiceField(choices=March.Kind.choices, allow_blank=True, required=False)

    def validate(self, data):
        # a new march is saved with its type and primary commander (the web asks for both); the build after it
        if not self.partial:
            for field in ('kind', 'primary'):
                if not data.get(field):
                    raise serializers.ValidationError({field: 'required'})
        return super().validate(data)


def marches_of(player):
    return player.marches.all()


def own_march_data(march: March, check=None) -> dict:
    """A march for its player (and the superuser): with what is wrong with its pair and formation for the KvK
    evaluation"""
    return {**march_data(march), **(check or march_checker())(march)}


@never_cache
@api_view(['GET', 'POST', 'PATCH'])
@permission_classes([IsPlayer])
@throttle_classes([WriteThrottle])
def marches(request):
    """GET: the player's marches in order and who may see them. POST {kind, primary, secondary?}: the next march (at
    most MAX_MARCHES). PATCH {public: bool}: every signed-in player may see them, or only R4 and the superuser."""
    player = request.user.player
    if request.method == 'PATCH':
        public = request.data.get('public')
        if type(public) is not bool:
            return Response({'public': 'bool'}, status=400)
        player.marches_public = public
        player.save(update_fields=['marches_public'])
        return Response({'public': public})
    if request.method == 'POST':
        if blocked := cannot_post(player):
            return blocked
        form = MarchSerializer(data=request.data)
        form.is_valid(raise_exception=True)
        with transaction.atomic():
            count = player.marches.count()
            if count >= MAX_MARCHES:
                return Response({'detail': 'limit', 'max': MAX_MARCHES}, status=400)
            march = March.objects.create(player=player, position=count + 1, **form.validated_data)
        return Response(own_march_data(march), status=201)
    problem = march_checker()
    return Response(
        {
            'marches': [own_march_data(m, problem) for m in marches_of(player)],
            'max': MAX_MARCHES,
            'public': player.marches_public,
        }
    )


@never_cache
@api_view(['PATCH', 'DELETE'])
@permission_classes([IsPlayer])
@throttle_classes([WriteThrottle])
def march(request, march_id):
    """PATCH {kind?, primary?, secondary?, attack?, defense?, health?, damage?, white?, blue?, gold?, gear?, formation?,
    inscriptions?}. DELETE: the march; the later ones move up."""
    player = request.user.player
    mine = get_object_or_404(marches_of(player), pk=march_id)
    if request.method == 'DELETE':
        with transaction.atomic():
            position = mine.position
            mine.delete()
            player.marches.filter(position__gt=position).update(position=F('position') - 1)
        return Response(status=204)
    if blocked := cannot_post(player):
        return blocked
    form = MarchSerializer(data=request.data, partial=True, context={'current': current_of(mine)})
    form.is_valid(raise_exception=True)
    for field, value in form.validated_data.items():
        setattr(mine, field, value)
    mine.save()
    return Response(own_march_data(mine))


class CanSeeMarches(BasePermission):
    """Signed in with Discord, or a reviewer / the superuser (an admin signed in with a password)."""

    def has_permission(self, request, view):
        return bool(player_of(request.user)) or private_images.can_review(request.user)


@never_cache
@api_view(['GET'])
@permission_classes([CanSeeMarches])
def players_marches(request):
    """/marche: the marches of every player who made them public – for R4 and the superuser of every player – with
    the player's in-game name, Discord name, avatar and when a march changed last. Players without a march are left
    out. A player the superadmin has not approved yet sees only their own (Gether 12. 10. 2026), and the others – R4
    too – see only approved players' marches; the superuser sees everyone's, the hidden ones marked."""
    reviewer = private_images.can_review(request.user)
    me = player_of(request.user)
    players = Player.objects.filter(user__is_active=True, marches__isnull=False).distinct()
    mine = Q(pk=me.pk if me else None)
    if not reviewer:
        players = players.filter((Q(marches_public=True) & APPROVED) | mine if me and me.may_post else mine)
    elif not request.user.is_superuser:
        players = players.filter(APPROVED)
    players = players.select_related('user').prefetch_related('marches')
    # a pair the KvK evaluation does not score, a wrong formation: only the player and the superuser are told
    # (Gether 14. 10. 2026)
    problem = march_checker()

    def data_for(p):
        if request.user.is_superuser or (me and p.pk == me.pk):
            return [own_march_data(m, problem) for m in p.marches.all()]
        return [march_data(m) for m in p.marches.all()]

    rows = sorted(
        (
            {
                'id': p.pk,
                'name': p.name,
                'ingame_name': p.ingame_name,
                'avatar_url': p.avatar_url,
                'public': p.marches_public,
                # false: hidden from everyone but the superuser
                'approved': p.may_post,
                'me': bool(me and p.pk == me.pk),
                'marches': data_for(p),
                'updated_at': iso(max(m.updated_at for m in p.marches.all())),
            }
            for p in players
        ),
        key=lambda p: (p['ingame_name'] or p['name']).casefold(),
    )
    return Response({'players': rows, 'reviewer': reviewer})

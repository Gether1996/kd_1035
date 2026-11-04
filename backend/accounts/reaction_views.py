"""Likes and hearts on a picture of the site (Gether 4. 11. 2026) – the counts for everyone, a signed-in player adds
or takes back their own: GET/POST /api/reactions/<target>/."""

from django.db import IntegrityError, transaction
from django.db.models import Count
from django.views.decorators.cache import never_cache
from rest_framework.decorators import api_view, throttle_classes
from rest_framework.permissions import SAFE_METHODS
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle

from .models import Reaction
from .views import player_of

# the pictures players may react to – a reaction never creates a target
REACTION_TARGETS = frozenset({'brana-8'})


class ReactionThrottle(UserRateThrottle):
    """Clicks per player – a toggle, so a few dozen a minute is plenty"""

    scope = 'reactions'
    rate = '30/minute'

    def allow_request(self, request, view):
        return request.method in SAFE_METHODS or super().allow_request(request, view)


def shown_name(player) -> str:
    # the in-game name first, the Discord name as the fallback – like everywhere else on the site
    return player.ingame_name or player.global_name or player.username or f'#{player.pk}'


def state(target: str, player, superuser: bool = False) -> dict:
    rows = Reaction.objects.filter(target=target)
    counts = dict(rows.values('kind').annotate(n=Count('id')).values_list('kind', 'n'))
    mine = sorted(rows.filter(player=player).values_list('kind', flat=True)) if player else []
    data = {**{kind: counts.get(kind, 0) for kind in Reaction.Kind.values}, 'mine': mine}
    if superuser:
        # who reacted – the superadmin only (Gether 4. 11. 2026: "daj možnosť pozrieť si, kto tie reakcie dal"); the
        # proven flag after accounts/guard.py, newest first
        who = {kind: [] for kind in Reaction.Kind.values}
        for reaction in rows.select_related('player').order_by('-created_at', '-pk'):
            who[reaction.kind].append(shown_name(reaction.player))
        data['who'] = who
    return data


@never_cache
@api_view(['GET', 'POST'])
@throttle_classes([ReactionThrottle])
def reactions(request, target):
    """GET → {like, heart, mine: [kinds of the signed-in player], who (the superadmin: {like: [names], heart: […]})}; POST {kind} adds the player's reaction, or takes it
    back when it is there – the same answer. Anonymous visitors only read (403 {detail: 'sign_in'} on POST)."""
    if target not in REACTION_TARGETS:
        return Response({'detail': 'not_found'}, status=404)
    player = player_of(request.user)
    if request.method == 'POST':
        if player is None:
            return Response({'detail': 'sign_in'}, status=403)
        kind = request.data.get('kind') if isinstance(request.data, dict) else None
        if kind not in Reaction.Kind.values:
            return Response({'kind': 'invalid'}, status=400)
        mine = Reaction.objects.filter(player=player, target=target, kind=kind)
        if not mine.delete()[0]:
            try:
                with transaction.atomic():
                    Reaction.objects.create(player=player, target=target, kind=kind)
            except IntegrityError:
                pass  # a double click: the other request added it already
    return Response(state(target, player, request.user.is_superuser))

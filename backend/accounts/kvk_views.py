"""KvK sign-ups (/api/kvk/…): players sign up for rally and / or garrison, each filled in like a march (Gether
11. 10. 2026) – commander pair, armament bonuses and one screenshot of the equipment and one of the armaments; reviewers (Player.kvk_reviewer, e.g. R4) and the superuser see every sign-up together
with the player's marches (/ucet); the superuser opens and closes the rounds and picks the reviewers. Session + CSRF
like the rest of the player API. Closed rounds are deleted KVK_KEEP_DAYS later (cleanup.py).
"""

import logging

from django.db import transaction
from django.db.models import Count, Prefetch
from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.views.decorators.cache import never_cache
from rest_framework import serializers
from rest_framework.decorators import api_view, parser_classes, permission_classes, throttle_classes
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle

from . import private_images
from .army import ArmySerializer
from .models import MARCH_STATS, KvkImage, KvkRound, KvkSignup, March, Player
from .reminder_views import IsPlayer, WriteThrottle, iso
from .views import player_of

log = logging.getLogger(__name__)
KINDS = [kind for kind, _ in KvkImage.Kind.choices]
ROLES = [role for role, _ in KvkSignup.Role.choices]
# one screenshot of the equipment and one of the armaments, like a march
MAX_IMAGES_PER_KIND = 1


class IsReviewer(BasePermission):
    def has_permission(self, request, view):
        return private_images.can_review(request.user)


class IsSuperuser(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.is_superuser


class UploadThrottle(UserRateThrottle):
    """Screenshots per player (KvK and marches) – each one is decoded and re-encoded on the server."""

    scope = 'private_upload'
    rate = '60/hour'


# ---------------------------------------------------------------- data


def round_data(kvk_round: KvkRound | None) -> dict | None:
    if not kvk_round:
        return None
    return {
        'id': kvk_round.pk,
        'title_sk': kvk_round.title_sk,
        'title_cs': kvk_round.title_cs,
        'is_open': kvk_round.is_open,
        'created_at': iso(kvk_round.created_at),
        'closed_at': iso(kvk_round.closed_at) if kvk_round.closed_at else None,
    }


def image_data(image, base: str) -> dict:
    url = f'{base}{image.pk}/'
    return {
        'id': image.pk,
        'kind': image.kind,
        'url': url,
        'thumb': f'{url}?thumb=1',
        'width': image.width,
        'height': image.height,
    }


def army_data(army) -> dict:
    """The commander pair and the armament bonuses of a march or a sign-up (ArmyFields)."""
    return {'primary': army.primary, 'secondary': army.secondary, **{field: getattr(army, field) for field in MARCH_STATS}}


def march_data(march: March) -> dict:
    return {
        'id': march.pk,
        'position': march.position,
        'kind': march.kind,
        **army_data(march),
        'images': [image_data(image, '/api/marches/images/') for image in march.images.all()],
    }


def signup_data(signup: KvkSignup, with_player=False) -> dict:
    images = list(signup.images.all())
    data = {
        'id': signup.pk,
        'round': signup.round_id,
        'role': signup.role,
        **army_data(signup),
        'note': signup.note,
        'updated_at': iso(signup.updated_at),
        'images': [image_data(image, '/api/kvk/images/') for image in images],
        # a screenshot of every kind
        'complete': {image.kind for image in images} >= set(KINDS),
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


def open_round() -> KvkRound | None:
    return KvkRound.objects.filter(is_open=True).order_by('-created_at').first()


def signups_of(player: Player) -> list[KvkSignup]:
    """Every sign-up of the player, newest round first."""
    return list(
        KvkSignup.objects.filter(player=player)
        .select_related('round')
        .prefetch_related('images')
        .order_by('-round__created_at')
    )


# ---------------------------------------------------------------- the player


class SignupSerializer(ArmySerializer):
    ingame_name = serializers.CharField(max_length=32, trim_whitespace=True)
    role = serializers.ChoiceField(choices=KvkSignup.Role.choices)
    note = serializers.CharField(max_length=500, allow_blank=True, default='', trim_whitespace=True)

    def validate(self, data):
        # the primary commander is required, like in a march
        if not data.get('primary'):
            raise serializers.ValidationError({'primary': 'required'})
        return super().validate(data)


@never_cache
@api_view(['GET'])
def state(request):
    """The open round, the player's rally and garrison sign-ups and what the visitor may do. Anyone may ask
    (anonymous visitors get the round only, to see whether sign-ups are open)."""
    player = player_of(request.user)
    current = open_round()
    mine = signups_of(player) if player else []
    now = [s for s in mine if current and s.round_id == current.pk]
    return Response(
        {
            'round': round_data(current),
            'signups': {role: next((signup_data(s) for s in now if s.role == role), None) for role in ROLES},
            # sign-ups in closed rounds: the reviewers still see them until the round is deleted (60 days), so the
            # player sees them too and may withdraw them or delete their screenshots
            'older': [{'round': round_data(s.round), 'signup': signup_data(s)} for s in mine if s not in now],
            'player': bool(player),
            'ingame_name': player.ingame_name if player else '',
            'reviewer': private_images.can_review(request.user),
            'superuser': bool(request.user.is_authenticated and request.user.is_superuser),
        }
    )


@never_cache
@api_view(['PUT', 'DELETE'])
@permission_classes([IsPlayer])
@throttle_classes([WriteThrottle])
def signup(request):
    """PUT {role, …}: sign up for the open round as rally or garrison, or change that sign-up (the in-game name is
    saved on the player too). DELETE ?role=<rally|garrison>[&round=<id>]: withdraw that sign-up of the round (default:
    the open one), screenshots included."""
    player = request.user.player
    current = open_round()
    if request.method == 'DELETE':
        round_id = request.query_params.get('round')
        role = request.query_params.get('role')
        if round_id is not None and not round_id.isdigit():
            return Response({'round': 'invalid'}, status=400)
        if role not in ROLES:
            return Response({'role': 'invalid'}, status=400)
        target = int(round_id) if round_id else (current.pk if current else None)
        KvkSignup.objects.filter(player=player, round_id=target, role=role).delete()
        return Response(status=204)
    if not current:
        return Response({'detail': 'closed'}, status=409)
    form = SignupSerializer(data=request.data)
    form.is_valid(raise_exception=True)
    data = form.validated_data
    with transaction.atomic():
        player.ingame_name = data.pop('ingame_name')
        player.save(update_fields=['ingame_name'])
        mine, _ = KvkSignup.objects.update_or_create(round=current, player=player, role=data.pop('role'), defaults=data)
    return Response(signup_data(mine))


def store_image(model, upload_file, folder: str, **fields):
    """Re-encodes the upload and writes its row; without the row the files would be orphans, so they go too."""
    path, thumb, width, height = private_images.store(upload_file, folder)
    try:
        return model.objects.create(path=path, thumb=thumb, width=width, height=height, **fields)
    except Exception:
        private_images.unlink(path, thumb)
        raise


@never_cache
@api_view(['POST'])
@parser_classes([MultiPartParser])
@permission_classes([IsPlayer])
@throttle_classes([UploadThrottle])
def upload(request):
    """POST multipart {role: rally|garrison, kind: equipment|armaments, file}: the screenshot for that sign-up of the
    player in the open round."""
    player = request.user.player
    current = open_round()
    role = request.data.get('role')
    mine = current and KvkSignup.objects.filter(round=current, player=player, role=role).first()
    if not mine:
        return Response({'detail': 'no_signup'}, status=409)
    kind = request.data.get('kind')
    upload_file = request.FILES.get('file')
    if kind not in KINDS or not upload_file:
        return Response({'detail': 'bad_request'}, status=400)
    if mine.images.filter(kind=kind).count() >= MAX_IMAGES_PER_KIND:
        return Response({'detail': 'limit'}, status=400)
    try:
        picture = store_image(KvkImage, upload_file, 'kvk', signup=mine, kind=kind)
    except private_images.BadImage as exc:
        return Response({'detail': exc.code}, status=400)
    mine.save(update_fields=['updated_at'])
    return Response(image_data(picture, '/api/kvk/images/'), status=201)


@never_cache
@api_view(['DELETE'])
@permission_classes([IsPlayer])
@throttle_classes([WriteThrottle])
def delete_image(request, image_id):
    """DELETE one of the player's own screenshots (also in a closed round)."""
    get_object_or_404(KvkImage, pk=image_id, signup__player=request.user.player).delete()
    return Response(status=204)


def owner_or_reviewer(request, owner_id: int) -> None:
    """404 (not 403) for anyone else, so ids reveal nothing."""
    player = player_of(request.user)
    if not (private_images.can_review(request.user) or (player and player.pk == owner_id)):
        raise Http404


@api_view(['GET'])
def image(request, image_id):
    """The screenshot file (?thumb=1 the thumbnail) – for its owner, the reviewers and the superuser only."""
    picture = get_object_or_404(KvkImage.objects.select_related('signup'), pk=image_id)
    owner_or_reviewer(request, picture.signup.player_id)
    return private_images.serve(picture.thumb if request.query_params.get('thumb') == '1' else picture.path)


# ---------------------------------------------------------------- reviewers


@never_cache
@api_view(['GET'])
@permission_classes([IsReviewer])
def round_signups(request, round_id):
    """Every sign-up of a round with the player (name, in-game name, Discord ID for "Kontaktovať") and their marches."""
    kvk_round = get_object_or_404(KvkRound, pk=round_id)
    signups = KvkSignup.objects.filter(round=kvk_round).select_related('player').prefetch_related(
        'images', Prefetch('player__marches', queryset=March.objects.prefetch_related('images'))
    )
    rows = sorted(
        (signup_data(s, with_player=True) for s in signups),
        key=lambda s: ((s['player']['ingame_name'] or s['player']['name']).casefold(), s['role']),
    )
    return Response({'round': round_data(kvk_round), 'signups': rows})


class NewRoundSerializer(serializers.Serializer):
    title_sk = serializers.CharField(max_length=80, trim_whitespace=True)
    title_cs = serializers.CharField(max_length=80, allow_blank=True, default='', trim_whitespace=True)


class RoundSerializer(NewRoundSerializer):
    is_open = serializers.BooleanField(required=False)


def close_others(keep: KvkRound | None = None) -> None:
    others = KvkRound.objects.filter(is_open=True)
    if keep:
        others = others.exclude(pk=keep.pk)
    others.update(is_open=False, closed_at=timezone.now())


@never_cache
@api_view(['GET', 'POST'])
@permission_classes([IsReviewer])
@throttle_classes([WriteThrottle])
def rounds(request):
    """GET (reviewers): every round with its number of sign-ups, newest first. POST (superuser): a new open round
    {title_sk, title_cs?} – the other rounds close."""
    if request.method == 'POST':
        if not request.user.is_superuser:
            return Response(status=403)
        form = NewRoundSerializer(data=request.data)
        form.is_valid(raise_exception=True)
        with transaction.atomic():
            close_others()
            created = KvkRound.objects.create(**form.validated_data, is_open=True)
        return Response(round_data(created) | {'signups': 0}, status=201)
    rows = KvkRound.objects.annotate(count=Count('signups')).order_by('-created_at')
    return Response({'rounds': [round_data(r) | {'signups': r.count} for r in rows]})


@never_cache
@api_view(['PATCH', 'DELETE'])
@permission_classes([IsSuperuser])
@throttle_classes([WriteThrottle])
def round_detail(request, round_id):
    """PATCH {title_sk?, title_cs?, is_open?} – opening one closes the others. DELETE: the round with every sign-up
    and screenshot."""
    kvk_round = get_object_or_404(KvkRound, pk=round_id)
    if request.method == 'DELETE':
        kvk_round.delete()
        return Response(status=204)
    form = RoundSerializer(data=request.data, partial=True)
    form.is_valid(raise_exception=True)
    data = form.validated_data
    with transaction.atomic():
        opened = data.get('is_open')
        if opened:
            close_others(keep=kvk_round)
        if opened is not None and opened != kvk_round.is_open:
            # the retention counts from the last closing (cleanup.prune_kvk)
            kvk_round.closed_at = None if opened else timezone.now()
        for field, value in data.items():
            setattr(kvk_round, field, value)
        kvk_round.save()
    return Response(round_data(kvk_round) | {'signups': kvk_round.signups.count()})


# ---------------------------------------------------------------- superuser: who sees the sign-ups


@never_cache
@api_view(['GET'])
@permission_classes([IsSuperuser])
def reviewers(request):
    """Every active player signed in with Discord, with the reviewer flag."""
    players = Player.objects.filter(user__is_active=True).select_related('user')
    rows = sorted(
        (
            {
                'id': p.pk,
                'name': p.name,
                'ingame_name': p.ingame_name,
                'avatar_url': p.avatar_url,
                'reviewer': p.kvk_reviewer,
                'superuser': p.user.is_superuser,
            }
            for p in players
        ),
        key=lambda p: (p['ingame_name'] or p['name']).casefold(),
    )
    return Response({'players': rows})


@never_cache
@api_view(['PATCH'])
@permission_classes([IsSuperuser])
@throttle_classes([WriteThrottle])
def reviewer(request, player_id):
    """PATCH {reviewer: bool}."""
    player = get_object_or_404(Player, pk=player_id)
    value = request.data.get('reviewer')
    if type(value) is not bool:
        return Response({'reviewer': 'bool'}, status=400)
    player.kvk_reviewer = value
    player.save(update_fields=['kvk_reviewer'])
    log.info('KvK reviewer %s for player %s', value, player.pk)
    return Response({'id': player.pk, 'reviewer': player.kvk_reviewer})

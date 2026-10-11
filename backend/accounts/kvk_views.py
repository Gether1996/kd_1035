"""KvK sign-ups (/api/kvk/…): players sign up for rally and / or garrison, each filled in like a march (Gether
11. 10. 2026) – commander pair, armament bonuses and one screenshot of the equipment and one of the armaments. No rounds:
a sign-up stays until the player or the superuser withdraws it; the superuser only sets the heading (KvkSettings, e.g.
the date of the next KvK) and picks the reviewers. Reviewers (Player.kvk_reviewer, e.g. R4) and the superuser see every
sign-up with the player's marches. Session + CSRF like the rest of the player API.
"""

import logging

from django.db import transaction
from django.db.models import Prefetch
from django.http import Http404
from django.shortcuts import get_object_or_404
from django.views.decorators.cache import never_cache
from rest_framework import serializers
from rest_framework.decorators import api_view, parser_classes, permission_classes, throttle_classes
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle

from . import private_images
from .army import ArmySerializer
from .models import MARCH_STATS, KvkImage, KvkSettings, KvkSignup, March, Player
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


def settings_data() -> dict:
    heading = KvkSettings.load()
    return {'title_sk': heading.title_sk, 'title_cs': heading.title_cs}


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
        'role': signup.role,
        'kind': signup.kind,
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


def signups_of(player: Player) -> list[KvkSignup]:
    return list(KvkSignup.objects.filter(player=player).prefetch_related('images'))


# ---------------------------------------------------------------- the player


class SignupSerializer(ArmySerializer):
    ingame_name = serializers.CharField(max_length=32, trim_whitespace=True)
    role = serializers.ChoiceField(choices=KvkSignup.Role.choices)
    kind = serializers.ChoiceField(choices=KvkSignup.Kind.choices)
    note = serializers.CharField(max_length=500, allow_blank=True, default='', trim_whitespace=True)

    def validate(self, data):
        # the primary commander is required, like in a march
        if not data.get('primary'):
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
            'reviewer': private_images.can_review(request.user),
            'superuser': bool(request.user.is_authenticated and request.user.is_superuser),
        }
    )


@never_cache
@api_view(['PUT', 'DELETE'])
@permission_classes([IsPlayer])
@throttle_classes([WriteThrottle])
def signup(request):
    """PUT {role, …}: sign up as rally or garrison, or change that sign-up (the in-game name is saved on the player
    too). DELETE ?role=<rally|garrison>: withdraw that sign-up, screenshots included."""
    player = request.user.player
    if request.method == 'DELETE':
        role = request.query_params.get('role')
        if role not in ROLES:
            return Response({'role': 'invalid'}, status=400)
        KvkSignup.objects.filter(player=player, role=role).delete()
        return Response(status=204)
    form = SignupSerializer(data=request.data)
    form.is_valid(raise_exception=True)
    data = form.validated_data
    with transaction.atomic():
        player.ingame_name = data.pop('ingame_name')
        player.save(update_fields=['ingame_name'])
        mine, _ = KvkSignup.objects.update_or_create(player=player, role=data.pop('role'), defaults=data)
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
    player."""
    mine = KvkSignup.objects.filter(player=request.user.player, role=request.data.get('role')).first()
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
    """DELETE one of the player's own screenshots."""
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
def all_signups(request):
    """Every sign-up with the player (name, in-game name, Discord ID for "Kontaktovať") and their marches."""
    signups = KvkSignup.objects.select_related('player').prefetch_related(
        'images', Prefetch('player__marches', queryset=March.objects.prefetch_related('images'))
    )
    rows = sorted(
        (signup_data(s, with_player=True) for s in signups),
        key=lambda s: ((s['player']['ingame_name'] or s['player']['name']).casefold(), s['role']),
    )
    return Response({'signups': rows})


@never_cache
@api_view(['DELETE'])
@permission_classes([IsSuperuser])
@throttle_classes([WriteThrottle])
def delete_signup(request, signup_id):
    """The superuser withdraws someone's sign-up, screenshots included."""
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

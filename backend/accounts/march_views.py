"""The player's marches on /marche ("Moje marche", Gether 11. 10. 2026): up to MAX_MARCHES, each with a type, the
army (commander pair, armament bonuses and inscriptions – army.py) and a screenshot of the equipment. The player edits them; the
reviewers and the superuser see them next to the player's KvK sign-up. Session + CSRF, players signed in with Discord.
"""

from collections import Counter

from django.db import transaction
from django.db.models import F, Prefetch, Q
from django.shortcuts import get_object_or_404
from django.views.decorators.cache import never_cache
from rest_framework import serializers
from rest_framework.decorators import api_view, parser_classes, permission_classes, throttle_classes
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import BasePermission
from rest_framework.response import Response

from guides import armory

from . import private_images
from .army import ArmySerializer
from .kvk_views import UploadThrottle, image_data, march_data, owner_or_reviewer, store_image
from .models import MAX_MARCHES, March, MarchImage, Player
from .reminder_views import IsPlayer, WriteThrottle
from .views import player_of

IMAGE_KINDS = [kind for kind, _ in MarchImage.Kind.choices]
REQUIRED_STATS = ('attack', 'defense', 'health', 'white', 'blue', 'gold')
# one screenshot of the equipment per march; the armaments are typed in (Gether 11. 10. 2026)
MAX_IMAGES_PER_KIND = 1


class MarchSerializer(ArmySerializer):
    kind = serializers.ChoiceField(choices=March.Kind.choices, allow_blank=True, required=False)
    # the build clicked together (guides/armory.py), optional
    gear = serializers.JSONField(required=False)
    formation = serializers.CharField(max_length=20, allow_blank=True, required=False)
    inscriptions = serializers.ListField(
        child=serializers.CharField(max_length=40), max_length=armory.MAX_INSCRIPTIONS, required=False
    )

    def validate_gear(self, value):
        """{slot: {item, crit?, iconic?}} → the same with every key; an item fits its slot, two accessories differ."""
        if not isinstance(value, dict) or set(value) - set(armory.MARCH_SLOTS):
            raise serializers.ValidationError('slots')
        items, gear = armory.items(), {}
        for slot in armory.MARCH_SLOTS:
            piece = value.get(slot)
            if piece is None:
                continue
            raw = piece.get('item') if isinstance(piece, dict) else None
            item = items.get(raw) if isinstance(raw, str) else None
            if not item or item['slot'] != armory.slot_of(slot):
                raise serializers.ValidationError(slot)
            crit, iconic = piece.get('crit', False), piece.get('iconic', 0)
            if type(crit) is not bool or type(iconic) is not int or not 0 <= iconic <= armory.ICONIC_MAX:
                raise serializers.ValidationError(slot)
            if iconic and not item.get('iconic'):
                raise serializers.ValidationError(slot)
            gear[slot] = {'item': item['id'], 'crit': crit, 'iconic': iconic}
        if 'accessory1' in gear and gear['accessory1']['item'] == gear.get('accessory2', {}).get('item'):
            raise serializers.ValidationError('accessory2')
        return gear

    def validate_formation(self, value):
        if value and value not in armory.formations():
            raise serializers.ValidationError('unknown')
        return value

    def validate(self, data):
        # a new march is saved with its type and primary commander (the web asks for both)
        if not self.partial:
            for field in ('kind', 'primary'):
                if not data.get(field):
                    raise serializers.ValidationError({field: 'required'})
        data = super().validate(data)
        # the inscriptions of the formation (its own ones) and the common ones, each once
        if 'formation' in data or 'inscriptions' in data:
            current = self.context.get('current') or {}
            formation = data.get('formation', current.get('formation', ''))
            chosen = data.get('inscriptions', current.get('inscriptions', []))
            allowed = armory.formations().get(formation, set()) | armory.common_inscriptions()
            if len(set(chosen)) != len(chosen) or not set(chosen) <= allowed:
                raise serializers.ValidationError({'inscriptions': 'unknown'})
            pieces = Counter(armory.inscription_pieces()[i] for i in chosen)
            if any(count > armory.MAX_PER_PIECE for count in pieces.values()):
                raise serializers.ValidationError({'inscriptions': 'per_piece'})
        # the armament bonuses and inscriptions are required (Gether 11. 10. 2026; 0 counts), All DMG may stay empty =
        # 0. A new march brings them all; a change may not clear one. Marches saved before keep their empty ones until
        # the player edits them.
        for field in REQUIRED_STATS:
            if (not self.partial and data.get(field) is None) or (field in data and data[field] is None):
                raise serializers.ValidationError({field: 'required'})
        if not self.partial and data.get('damage') is None:
            data['damage'] = 0
        return data


def marches_of(player):
    return player.marches.prefetch_related('images')


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
        form = MarchSerializer(data=request.data)
        form.is_valid(raise_exception=True)
        with transaction.atomic():
            count = player.marches.count()
            if count >= MAX_MARCHES:
                return Response({'detail': 'limit', 'max': MAX_MARCHES}, status=400)
            march = March.objects.create(player=player, position=count + 1, **form.validated_data)
        return Response(march_data(march), status=201)
    return Response(
        {'marches': [march_data(m) for m in marches_of(player)], 'max': MAX_MARCHES, 'public': player.marches_public}
    )


@never_cache
@api_view(['PATCH', 'DELETE'])
@permission_classes([IsPlayer])
@throttle_classes([WriteThrottle])
def march(request, march_id):
    """PATCH {kind?, primary?, secondary?, attack?, defense?, health?, damage?, white?, blue?, gold?}. DELETE: the march and its screenshots; the later ones move up."""
    player = request.user.player
    mine = get_object_or_404(marches_of(player), pk=march_id)
    if request.method == 'DELETE':
        with transaction.atomic():
            position = mine.position
            mine.delete()
            player.marches.filter(position__gt=position).update(position=F('position') - 1)
        return Response(status=204)
    form = MarchSerializer(
        data=request.data, partial=True, context={
            'current': {
                'primary': mine.primary,
                'secondary': mine.secondary,
                'formation': mine.formation,
                'inscriptions': mine.inscriptions,
            }
        }
    )
    form.is_valid(raise_exception=True)
    for field, value in form.validated_data.items():
        setattr(mine, field, value)
    mine.save()
    return Response(march_data(mine))


@never_cache
@api_view(['POST'])
@parser_classes([MultiPartParser])
@permission_classes([IsPlayer])
@throttle_classes([UploadThrottle])
def upload(request, march_id):
    """POST multipart {kind: equipment, file}: the screenshot of the march's equipment (one – a new one replaces it)."""
    mine = get_object_or_404(March, pk=march_id, player=request.user.player)
    kind = request.data.get('kind')
    upload_file = request.FILES.get('file')
    if kind not in IMAGE_KINDS or not upload_file:
        return Response({'detail': 'bad_request'}, status=400)
    # a new screenshot replaces the old one of that kind – only once it is stored, so a refused upload loses nothing
    old = list(mine.images.filter(kind=kind))
    try:
        picture = store_image(MarchImage, upload_file, 'marches', march=mine, kind=kind)
    except private_images.BadImage as exc:
        return Response({'detail': exc.code}, status=400)
    for image in old[: len(old) - MAX_IMAGES_PER_KIND + 1]:
        image.delete()
    mine.save(update_fields=['updated_at'])
    return Response(image_data(picture, '/api/marches/images/'), status=201)


@never_cache
@api_view(['DELETE'])
@permission_classes([IsPlayer])
@throttle_classes([WriteThrottle])
def delete_image(request, image_id):
    get_object_or_404(MarchImage, pk=image_id, march__player=request.user.player).delete()
    return Response(status=204)


@api_view(['GET'])
def image(request, image_id):
    """The file (?thumb=1 the thumbnail) for the player, the reviewers and the superuser – and for every signed-in
    player when the owner made the marches public; 404 for anyone else."""
    picture = get_object_or_404(MarchImage.objects.select_related('march__player'), pk=image_id)
    # a player who made the marches public shows them to every signed-in player
    if not (picture.march.player.marches_public and player_of(request.user)):
        owner_or_reviewer(request, picture.march.player_id)
    return private_images.serve(picture.thumb if request.query_params.get('thumb') == '1' else picture.path)


class CanSeeMarches(BasePermission):
    """Signed in with Discord, or a reviewer / the superuser (an admin signed in with a password)."""

    def has_permission(self, request, view):
        return bool(player_of(request.user)) or private_images.can_review(request.user)


@never_cache
@api_view(['GET'])
@permission_classes([CanSeeMarches])
def players_marches(request):
    """/marche: the marches of every player who made them public – for R4 and the superuser of every player – with
    the player's in-game name, Discord name and avatar. Players without a march are left out."""
    reviewer = private_images.can_review(request.user)
    me = player_of(request.user)
    players = Player.objects.filter(user__is_active=True, marches__isnull=False).distinct()
    if not reviewer:
        players = players.filter(Q(marches_public=True) | Q(pk=me.pk if me else None))
    players = players.prefetch_related(Prefetch('marches', queryset=March.objects.prefetch_related('images')))
    rows = sorted(
        (
            {
                'id': p.pk,
                'name': p.name,
                'ingame_name': p.ingame_name,
                'avatar_url': p.avatar_url,
                'public': p.marches_public,
                'me': bool(me and p.pk == me.pk),
                'marches': [march_data(m) for m in p.marches.all()],
            }
            for p in players
        ),
        key=lambda p: (p['ingame_name'] or p['name']).casefold(),
    )
    return Response({'players': rows, 'reviewer': reviewer})

"""The player's marches on /ucet ("Moji commanderi a výbava", Gether 11. 10. 2026): up to MAX_MARCHES, each with a
type, a commander pair from our guides and screenshots of equipment and armaments. The player edits them; the
reviewers and the superuser see them next to the player's KvK sign-up. Session + CSRF, players signed in with Discord.
"""

from django.db import transaction
from django.db.models import F
from django.shortcuts import get_object_or_404
from django.views.decorators.cache import never_cache
from guides.commander_index import commander_index
from rest_framework import serializers
from rest_framework.decorators import api_view, parser_classes, permission_classes, throttle_classes
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response

from . import private_images
from .kvk_views import UploadThrottle, image_data, march_data, owner_or_reviewer, store_image
from .models import MAX_MARCHES, March, MarchImage
from .reminder_views import IsPlayer, WriteThrottle

IMAGE_KINDS = [kind for kind, _ in MarchImage.Kind.choices]
# one screenshot of the equipment and one of the armaments per march (Gether 11. 10. 2026)
MAX_IMAGES_PER_KIND = 1


class MarchSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=March.Kind.choices, allow_blank=True, required=False)
    primary = serializers.CharField(max_length=40, allow_blank=True, required=False)
    secondary = serializers.CharField(max_length=40, allow_blank=True, required=False)

    def validate(self, data):
        # a new march is saved with its type and primary commander (the web asks for both)
        if not self.partial:
            for field in ('kind', 'primary'):
                if not data.get(field):
                    raise serializers.ValidationError({field: 'required'})
        # only commanders of our guides – the web shows their portraits
        known = {c['name'] for c in commander_index()}
        for field in ('primary', 'secondary'):
            if data.get(field) and data[field] not in known:
                raise serializers.ValidationError({field: 'unknown'})
        return data


def marches_of(player):
    return player.marches.prefetch_related('images')


@never_cache
@api_view(['GET', 'POST'])
@permission_classes([IsPlayer])
@throttle_classes([WriteThrottle])
def marches(request):
    """GET: the player's marches in order. POST {kind?, primary?, secondary?}: the next march (at most MAX_MARCHES)."""
    player = request.user.player
    if request.method == 'POST':
        form = MarchSerializer(data=request.data)
        form.is_valid(raise_exception=True)
        with transaction.atomic():
            count = player.marches.count()
            if count >= MAX_MARCHES:
                return Response({'detail': 'limit', 'max': MAX_MARCHES}, status=400)
            march = March.objects.create(player=player, position=count + 1, **form.validated_data)
        return Response(march_data(march), status=201)
    return Response({'marches': [march_data(m) for m in marches_of(player)], 'max': MAX_MARCHES})


@never_cache
@api_view(['PATCH', 'DELETE'])
@permission_classes([IsPlayer])
@throttle_classes([WriteThrottle])
def march(request, march_id):
    """PATCH {kind?, primary?, secondary?}. DELETE: the march and its screenshots; the later ones move up."""
    player = request.user.player
    mine = get_object_or_404(marches_of(player), pk=march_id)
    if request.method == 'DELETE':
        with transaction.atomic():
            position = mine.position
            mine.delete()
            player.marches.filter(position__gt=position).update(position=F('position') - 1)
        return Response(status=204)
    form = MarchSerializer(data=request.data, partial=True)
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
    """POST multipart {kind: equipment|armaments, file}: the screenshot of the march's equipment or armaments (one each)."""
    mine = get_object_or_404(March, pk=march_id, player=request.user.player)
    kind = request.data.get('kind')
    upload_file = request.FILES.get('file')
    if kind not in IMAGE_KINDS or not upload_file:
        return Response({'detail': 'bad_request'}, status=400)
    if mine.images.filter(kind=kind).count() >= MAX_IMAGES_PER_KIND:
        return Response({'detail': 'limit'}, status=400)
    try:
        picture = store_image(MarchImage, upload_file, 'marches', march=mine, kind=kind)
    except private_images.BadImage as exc:
        return Response({'detail': exc.code}, status=400)
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
    """The file (?thumb=1 the thumbnail) for the player, the reviewers and the superuser; 404 for anyone else."""
    picture = get_object_or_404(MarchImage.objects.select_related('march'), pk=image_id)
    owner_or_reviewer(request, picture.march.player_id)
    return private_images.serve(picture.thumb if request.query_params.get('thumb') == '1' else picture.path)

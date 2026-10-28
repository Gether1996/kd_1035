"""The Hall of Fame on /sien-slavy (Gether 28. 10. 2026): players the kingdom is proud of, one on the pedestal of each
category, and the mascots' corner (two names under a painting of two clowns, for fun). Approved players see it; only the
superadmin fills it in (a player of the website or just a name, a short reason in SK/CZ, a photo).

Photos are personal: they live in PRIVATE_MEDIA_ROOT/hall (never in MEDIA_ROOT that nginx serves to anyone, never in
git), come back re-encoded (no EXIF, at most PHOTO_SIZE px) and are served only to approved players by photo().
"""

import io
import secrets
from pathlib import Path

from django.conf import settings
from django.db import transaction
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.views.decorators.cache import never_cache
from PIL import Image, ImageOps, UnidentifiedImageError
from rest_framework import serializers
from rest_framework.decorators import api_view, parser_classes, permission_classes, throttle_classes
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.response import Response

from .kvk_views import IsSuperuser
from .march_views import IsApprovedPlayer
from .models import HallEntry, Player
from .reminder_views import WriteThrottle

FOLDER = 'hall'
# one champion on the pedestal of a category (Gether 28. 10. 2026: "vždy bude len 1 top hráč za kategóriu"), two
# mascots in their corner
PLACES = {category: 1 for category in HallEntry.Category.values} | {
    # top 3 to chase (Gether 28. 10. 2026: "nech je to motivačné"): the fort destroyers of the last week, the kill
    # points of the last KvK
    HallEntry.Category.FORTS: 3,
    HallEntry.Category.KP: 3,
    HallEntry.Category.MASCOT: 2,
    # the other corner: the three zeroed most in the last KvK (Gether 28. 10. 2026: "top 3 ZERO minulého KvK")
    HallEntry.Category.ZERO: 3,
}
PHOTO_SIZE = 900
PHOTO_MAX_BYTES = 10 * 1024 * 1024


def root() -> Path:
    return Path(settings.PRIVATE_MEDIA_ROOT)


def remove_photo(relative: str) -> None:
    # only a file of the hall's folder – never a path a row could point elsewhere
    path = (root() / relative).resolve()
    if path.parent == (root() / FOLDER).resolve():
        path.unlink(missing_ok=True)


def shown_name(entry: HallEntry) -> str:
    """the name on the page: the one typed in, else the player's in-game name, else their Discord name"""
    if entry.name:
        return entry.name
    if entry.player:
        return entry.player.ingame_name or entry.player.name
    return ''


def entry_data(entry: HallEntry, superuser: bool = False) -> dict:
    data = {
        'id': entry.pk,
        'category': entry.category,
        'place': entry.place,
        'name': shown_name(entry),
        'avatar_url': entry.player.avatar_url if entry.player else '',
        # the file name changes with each upload – the browser may keep it
        'photo': f'/api/hall/photos/{entry.pk}/?v={Path(entry.photo).stem[-8:]}' if entry.photo else '',
        'note': {'sk': entry.note_sk, 'cs': entry.note_cs or entry.note_sk},
        'count': entry.count,
    }
    if superuser:
        # what the editor fills in again
        data |= {'player': entry.player_id, 'custom_name': entry.name, 'note_sk': entry.note_sk, 'note_cs': entry.note_cs}
    return data


class EntrySerializer(serializers.Serializer):
    player = serializers.PrimaryKeyRelatedField(queryset=Player.objects.all(), allow_null=True, required=False)
    name = serializers.CharField(max_length=40, allow_blank=True, required=False, trim_whitespace=True)
    note_sk = serializers.CharField(max_length=120, allow_blank=True, required=False, trim_whitespace=True)
    note_cs = serializers.CharField(max_length=120, allow_blank=True, required=False, trim_whitespace=True)
    # forts or kill points as the superadmin writes them – "250", "1.37B"
    count = serializers.CharField(max_length=24, allow_blank=True, required=False, trim_whitespace=True)

    def validate(self, data):
        if not data.get('player') and not data.get('name'):
            raise serializers.ValidationError({'name': 'required'})
        return data


def place_of(category: str, place: int) -> tuple[str, int]:
    if category not in PLACES or not 1 <= place <= PLACES[category]:
        raise Http404
    return category, place


@never_cache
@api_view(['GET'])
@permission_classes([IsApprovedPlayer])
def hall(request):
    """Every filled place, in order. The superadmin also gets what the editor needs and the number of places."""
    superuser = request.user.is_superuser
    entries = HallEntry.objects.select_related('player')
    data = {'entries': [entry_data(e, superuser) for e in entries]}
    if superuser:
        data['places'] = PLACES
    return Response(data)


@api_view(['PUT', 'DELETE'])
@permission_classes([IsSuperuser])
@throttle_classes([WriteThrottle])
def place(request, category, place):
    """PUT {player?, name?, note_sk?, note_cs?}: who stands on the place (a player of the website or a name – at least
    one). DELETE: the place empty again, its photo too."""
    category, place = place_of(category, place)
    if request.method == 'DELETE':
        HallEntry.objects.filter(category=category, place=place).delete()
        return Response(status=204)
    serializer = EntrySerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=400)
    data = serializer.validated_data
    entry, _ = HallEntry.objects.update_or_create(
        category=category,
        place=place,
        defaults={
            'player': data.get('player'),
            'name': data.get('name', ''),
            'note_sk': data.get('note_sk', ''),
            'note_cs': data.get('note_cs', ''),
            'count': data.get('count', ''),
        },
    )
    return Response(entry_data(entry, superuser=True))


@api_view(['POST', 'DELETE'])
@permission_classes([IsSuperuser])
@parser_classes([MultiPartParser, JSONParser])
@throttle_classes([WriteThrottle])
def place_photo(request, category, place):
    """POST multipart `photo`: the place's photo (a JPEG, PNG, WebP… – stored as WebP, at most PHOTO_SIZE px, without
    its metadata). DELETE: no photo (the player's Discord avatar shows again)."""
    category, place = place_of(category, place)
    entry = get_object_or_404(HallEntry, category=category, place=place)
    old = entry.photo
    if request.method == 'DELETE':
        entry.photo = ''
    else:
        upload = request.FILES.get('photo')
        if not upload:
            return Response({'photo': 'required'}, status=400)
        if upload.size > PHOTO_MAX_BYTES:
            return Response({'photo': 'too_big'}, status=400)
        try:
            with Image.open(upload) as image:
                image = ImageOps.exif_transpose(image).convert('RGB')
                image.thumbnail((PHOTO_SIZE, PHOTO_SIZE))
                buffer = io.BytesIO()
                image.save(buffer, 'WEBP', quality=84)
        except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
            return Response({'photo': 'invalid'}, status=400)
        folder = root() / FOLDER
        folder.mkdir(parents=True, exist_ok=True)
        relative = f'{FOLDER}/{category}-{place}-{secrets.token_hex(8)}.webp'
        (root() / relative).write_bytes(buffer.getvalue())
        entry.photo = relative
    with transaction.atomic():
        entry.save(update_fields=['photo', 'updated_at'])
    if old and old != entry.photo:
        remove_photo(old)
    return Response(entry_data(entry, superuser=True))


@api_view(['GET'])
@permission_classes([IsApprovedPlayer])
def photo(request, entry_id):
    """A place's photo – approved players only, kept by their browser (the address changes with a new photo)."""
    entry = get_object_or_404(HallEntry, pk=entry_id)
    if not entry.photo:
        raise Http404
    path = (root() / entry.photo).resolve()
    if path.parent != (root() / FOLDER).resolve() or not path.is_file():
        raise Http404
    response = FileResponse(path.open('rb'), content_type='image/webp')
    response['Cache-Control'] = 'private, max-age=2592000'
    return response

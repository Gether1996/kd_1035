"""The Hall of Fame on /sien-slavy (Gether 28. 10. 2026): players the kingdom is proud of, one on the pedestal of each
category, and the mascots' corner (two names under a painting of two clowns, for fun). Approved players see it; only the
superadmin fills it in (a player of the website or just a name, a short reason in SK/CZ, a photo).

Photos are personal: they live in PRIVATE_MEDIA_ROOT/hall (never in MEDIA_ROOT that nginx serves to anyone, never in
git), come back re-encoded (no EXIF, at most PHOTO_SIZE px) and are served only to approved players by photo().
"""

import io
import secrets
from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.views.decorators.cache import never_cache
from PIL import Image, ImageOps, UnidentifiedImageError
from rest_framework import serializers
from rest_framework.decorators import api_view, parser_classes, permission_classes, throttle_classes
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.response import Response

from kingdom.discord import GOLD, UNCERTAIN, DiscordError, send

from .kvk_views import IsSuperuser
from .march_views import IsApprovedPlayer
from .models import HallArchive, HallArchiveEntry, HallEntry, HallFortsWeek, Player
from .reminder_views import WriteThrottle

FOLDER = 'hall'
# one champion on the pedestal of a category (Gether 28. 10. 2026: "vždy bude len 1 top hráč za kategóriu"), two
# mascots in their corner
PLACES = {category: 1 for category in HallEntry.Category.values} | {
    # to chase (Gether 28. 10. 2026: "nech je to motivačné"): the fort destroyers of the last week – up to 5 since
    # 7. 11. 2026 ("top 5 na forty, ale nemusí to byť pravidlo … akýkoľvek počet up to 5")
    HallEntry.Category.FORTS: 5,
    # the KP a top 5 (Gether 28. 10. 2026: "aby som zmestil top 5")
    HallEntry.Category.KP: 5,
    # the best equipment of Top 5 equip (3. 11. 2026): a place per troop type – 1 infantry, 2 cavalry, 3 archers
    HallEntry.Category.EQUIPMENT: 3,
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


class RankedSerializer(EntrySerializer):
    # the id of an entry of the same category whose photo moves here with its player
    photo_from = serializers.IntegerField(required=False, allow_null=True)


class RankingSerializer(serializers.Serializer):
    # null = an empty place (the best equipment: a troop type nobody has scored in yet stays empty)
    entries = serializers.ListField(child=RankedSerializer(allow_null=True), allow_empty=False)

    def validate_entries(self, entries):
        if not any(entries):
            raise serializers.ValidationError('empty')
        return entries


def place_of(category: str, place: int) -> tuple[str, int]:
    if category not in PLACES or not 1 <= place <= PLACES[category]:
        raise Http404
    return category, place


def locked(category: str) -> Response | None:
    """The fort destroyers posted to Discord stay as posted until they are archived (Gether 7. 11. 2026)"""
    if category == HallEntry.Category.FORTS and HallFortsWeek.load().published_at:
        return Response({'detail': 'published'}, status=409)
    return None


def week_data(week: HallFortsWeek, superuser: bool) -> dict:
    data = {'from': week.week_from, 'to': week.week_to}
    if superuser:
        data |= {'published_at': week.published_at, 'webhook': bool(settings.DISCORD_HALL_WEBHOOK_URL)}
    return data


@never_cache
@api_view(['GET'])
@permission_classes([IsApprovedPlayer])
def hall(request):
    """Every filled place, in order, and the archive (Sieň legiend), newest first. The superadmin also gets what the
    editor needs and the number of places."""
    superuser = request.user.is_superuser
    entries = HallEntry.objects.select_related('player')
    data = {
        'entries': [entry_data(e, superuser) for e in entries],
        'archive': archives(),
        # the week of the fort destroyers ("27. 10. – 2. 11."); the superadmin also whether it was posted
        'forts_week': week_data(HallFortsWeek.load(), superuser),
    }
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
    if refused := locked(category):
        return refused
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


@api_view(['PUT'])
@permission_classes([IsSuperuser])
@throttle_classes([WriteThrottle])
def ranking(request, category):
    """PUT {entries: [{player?, name?, note_sk?, note_cs?, count?, photo_from?} | null, …]}: the whole ranking of a
    category at once, place 1 first (the weekly fort destroyers from a screenshot of the game – Gether 29. 10. 2026,
    /prepis-top-forty; the best equipment from Top 5 equip, where null leaves the place of a troop type empty). A photo
    moves with its player (`photo_from` = their entry before); null places and places after the list become empty and
    photos nobody keeps are deleted."""
    if category not in PLACES:
        raise Http404
    if refused := locked(category):
        return refused
    serializer = RankingSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=400)
    ranked = serializer.validated_data['entries']
    if len(ranked) > PLACES[category]:
        return Response({'entries': 'too_many'}, status=400)
    # one photo file on two places: emptying one of them would delete the other's photo
    moved = [data['photo_from'] for data in ranked if data and data.get('photo_from') is not None]
    if len(moved) != len(set(moved)):
        return Response({'entries': 'photo_twice'}, status=400)
    empty = [place for place, data in enumerate(ranked, start=1) if not data]
    with transaction.atomic():
        before = {entry.pk: entry.photo for entry in HallEntry.objects.select_for_update().filter(category=category)}
        kept = []
        for place, data in enumerate(ranked, start=1):
            if not data:
                continue
            photo = before.get(data.get('photo_from'), '')
            kept.append(photo)
            HallEntry.objects.update_or_create(
                category=category,
                place=place,
                defaults={
                    'player': data.get('player'),
                    'name': data.get('name', ''),
                    'note_sk': data.get('note_sk', ''),
                    'note_cs': data.get('note_cs', ''),
                    'count': data.get('count', ''),
                    'photo': photo,
                },
            )
        # the null places and the places after the list: emptied without their photos (moved ones are cleared first,
        # so the delete signal does not remove a file another place now shows)
        rest = HallEntry.objects.filter(Q(place__gt=len(ranked)) | Q(place__in=empty), category=category)
        rest.update(photo='')
        rest.delete()
    for photo in set(before.values()) - set(kept):
        if photo:
            remove_photo(photo)
    entries = HallEntry.objects.filter(category=category).select_related('player').order_by('place')
    return Response({'entries': [entry_data(e, superuser=True) for e in entries]})


@api_view(['POST', 'DELETE'])
@permission_classes([IsSuperuser])
@parser_classes([MultiPartParser, JSONParser])
@throttle_classes([WriteThrottle])
def place_photo(request, category, place):
    """POST multipart `photo`: the place's photo (a JPEG, PNG, WebP… – stored as WebP, at most PHOTO_SIZE px, without
    its metadata). DELETE: no photo (the player's Discord avatar shows again)."""
    category, place = place_of(category, place)
    if refused := locked(category):
        return refused
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


# ---------------------------------------------------------------- Sieň legiend


def archives() -> list[dict]:
    """The archived halls, newest first – names, numbers and reasons as they were, never a photo or an account"""
    return [
        {
            'id': archive.pk,
            'label': archive.label,
            'week_from': archive.week_from,
            'week_to': archive.week_to,
            'created_at': archive.created_at,
            'entries': [
                {
                    'category': e.category,
                    'place': e.place,
                    'name': e.name,
                    'count': e.count,
                    'note': {'sk': e.note_sk, 'cs': e.note_cs or e.note_sk},
                }
                for e in archive.entries.all()
            ],
        }
        for archive in HallArchive.objects.prefetch_related('entries')
    ]


class ArchiveSerializer(serializers.Serializer):
    # "KvK 3", "Týždeň 44"
    label = serializers.CharField(max_length=40, trim_whitespace=True)
    categories = serializers.ListField(
        child=serializers.ChoiceField(choices=HallEntry.Category.values), allow_empty=False, max_length=len(PLACES)
    )


@api_view(['POST'])
@permission_classes([IsSuperuser])
@throttle_classes([WriteThrottle])
def archive(request):
    """POST {label, categories}: copies the filled places of the categories into a new archive (Gether 3. 11. 2026 –
    the champions of a past KvK or week are not lost when the hall is rewritten). Later edits of the hall and deleted
    accounts do not change it."""
    serializer = ArchiveSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=400)
    data = serializer.validated_data
    entries = [
        e for e in HallEntry.objects.select_related('player').filter(category__in=data['categories']) if shown_name(e)
    ]
    if not entries:
        return Response({'categories': 'empty'}, status=400)
    with transaction.atomic():
        saved = HallArchive.objects.create(label=data['label'])
        HallArchiveEntry.objects.bulk_create(
            HallArchiveEntry(
                archive=saved,
                category=e.category,
                place=e.place,
                name=shown_name(e)[:64],
                count=e.count,
                note_sk=e.note_sk,
                note_cs=e.note_cs,
            )
            for e in entries
        )
    return Response({'archive': archives()}, status=201)


@api_view(['DELETE'])
@permission_classes([IsSuperuser])
@throttle_classes([WriteThrottle])
def archive_delete(request, archive_id):
    """DELETE: the archive with all its names"""
    get_object_or_404(HallArchive, pk=archive_id).delete()
    return Response(status=204)


# ---------------------------------------------------------------- the week of the fort destroyers (Gether 7. 11. 2026)


def days(start, end) -> str:
    """'27. 10. – 2. 11. 2026' – the year once at the end, at the start too when the week crosses New Year"""
    if not start or not end:
        return ''
    first = f'{start.day}. {start.month}.' + (f' {start.year}' if start.year != end.year else '')
    return f'{first} – {end.day}. {end.month}. {end.year}'


def forts_amount(count: str) -> str:
    """'200 pevností' like the page; anything not just digits as written"""
    text = count.strip()
    if not text.isdigit():
        return text
    n = int(text)
    word = 'pevnosť' if n == 1 else 'pevnosti' if 2 <= n <= 4 else 'pevností'
    return f'{n} {word}'


# the characters of Discord markdown – a name stays plain text
MARKDOWN = set('\\*_~`|>[]()#')


def escape(text: str) -> str:
    return ''.join('\\' + ch if ch in MARKDOWN else ch for ch in text)


MEDALS = {1: '🥇', 2: '🥈', 3: '🥉'}


def forts_payload(entries: list[HallEntry], week: HallFortsWeek) -> dict:
    """The new ranking for the channel "sieň slávy" with @everyone – Slovak, like the event messages"""
    lines = []
    for e in entries:
        rank = MEDALS.get(e.place, f'**{e.place}.**')
        amount = forts_amount(e.count)
        lines.append(f'{rank} **{escape(shown_name(e))}**' + (f' · {amount}' if amount else ''))
    when = days(week.week_from, week.week_to)
    head = f'Týždeň **{when}**\n\n' if when else ''
    embed = {
        'title': '🏰 Ničitelia pevností',
        'description': head + '\n'.join(lines),
        'color': GOLD,
        'footer': {'text': 'Sieň slávy · KD 1035'},
    }
    payload = {
        'username': 'Kingdom 1035',
        'content': '@everyone',
        'allowed_mentions': {'parse': ['everyone']},
        'embeds': [embed],
    }
    if settings.SITE_URL:
        embed['url'] = f'{settings.SITE_URL}/sien-slavy'
        payload['avatar_url'] = f'{settings.SITE_URL}/icons/icon-192.png'
    return payload


class WeekSerializer(serializers.Serializer):
    week_from = serializers.DateField(allow_null=True)
    week_to = serializers.DateField(allow_null=True)

    def validate(self, data):
        start, end = data['week_from'], data['week_to']
        if bool(start) != bool(end):
            raise serializers.ValidationError({'week': 'both'})
        if start and not timedelta(0) <= end - start <= timedelta(days=31):
            raise serializers.ValidationError({'week': 'range'})
        return data


def forts_entries() -> list[HallEntry]:
    rows = HallEntry.objects.select_related('player').filter(category=HallEntry.Category.FORTS).order_by('place')
    return [e for e in rows if shown_name(e)]


def the_week() -> HallFortsWeek:
    """the one row, locked for the rest of the transaction"""
    return HallFortsWeek.objects.select_for_update().get(pk=HallFortsWeek.load().pk)


@api_view(['PUT'])
@permission_classes([IsSuperuser])
@throttle_classes([WriteThrottle])
def forts_week(request):
    """PUT {week_from, week_to} (YYYY-MM-DD, or both null): the week the fort ranking is of – not once it is posted"""
    if refused := locked(HallEntry.Category.FORTS):
        return refused
    serializer = WeekSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=400)
    week = HallFortsWeek.load()
    week.week_from = serializer.validated_data['week_from']
    week.week_to = serializer.validated_data['week_to']
    week.save()
    return Response(week_data(week, superuser=True))


@api_view(['POST'])
@permission_classes([IsSuperuser])
@throttle_classes([WriteThrottle])
def forts_publish(request):
    """POST: the fort ranking to the channel "sieň slávy" with @everyone (Gether 7. 11. 2026) – once; afterwards the
    category is locked until it is archived. 409 posted already, 400 {detail: empty | week}, 503 no webhook, 502 Discord
    failed (`uncertain`: it may have arrived – look in the channel before trying again)."""
    with transaction.atomic():
        week = the_week()
        if week.published_at:
            return Response({'detail': 'published'}, status=409)
        entries = forts_entries()
        if not entries:
            return Response({'detail': 'empty'}, status=400)
        if not week.week_from:
            return Response({'detail': 'week'}, status=400)
        url = settings.DISCORD_HALL_WEBHOOK_URL
        if not url:
            return Response({'detail': 'no_webhook'}, status=503)
        try:
            send(forts_payload(entries, week), url)
        except DiscordError as exc:
            return Response({'detail': 'discord', 'uncertain': str(exc).startswith(UNCERTAIN)}, status=502)
        week.published_at = timezone.now()
        week.save(update_fields=['published_at'])
    return Response(week_data(week, superuser=True))


@api_view(['POST'])
@permission_classes([IsSuperuser])
@throttle_classes([WriteThrottle])
def forts_archive(request):
    """POST: the fort ranking into Sieň legiend with its week (Gether 7. 11. 2026: "uloží sa do pamäte, nech vieme
    históriu"), then the category is emptied – photos too – and unlocked; the next 7 days are offered as the next week."""
    with transaction.atomic():
        week = the_week()
        entries = forts_entries()
        if not entries:
            return Response({'detail': 'empty'}, status=400)
        if week.week_from:
            label = f'Týždeň {days(week.week_from, week.week_to)}'
        else:
            today = timezone.localdate()
            label = f'Ničitelia pevností {today.day}. {today.month}. {today.year}'
        saved = HallArchive.objects.create(label=label[:40], week_from=week.week_from, week_to=week.week_to)
        HallArchiveEntry.objects.bulk_create(
            HallArchiveEntry(archive=saved, category=e.category, place=e.place, name=shown_name(e)[:64], count=e.count)
            for e in entries
        )
        # one by one: the delete signal removes each row's photo
        for entry in HallEntry.objects.filter(category=HallEntry.Category.FORTS):
            entry.delete()
        if week.week_to:
            week.week_from, week.week_to = week.week_to + timedelta(days=1), week.week_to + timedelta(days=7)
        week.published_at = None
        week.save()
    return Response({'archive': archives(), 'forts_week': week_data(week, superuser=True)}, status=201)

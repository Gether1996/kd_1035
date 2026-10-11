"""Private screenshots of players – KvK sign-ups (KvkImage) and marches on /ucet (MarchImage).

Seen only by the player, the reviewers (Player.kvk_reviewer, e.g. R4) and the superuser. Every upload is decoded and
saved again as WebP: no EXIF/GPS, XMP or ICC data survives, and a file that is not a real image is refused. The files
live under PRIVATE_MEDIA_ROOT (next to the database, never under the public /uploads/) and go out only through API
views that check who asks. The weekly backup has them as kd1035_<time>_private.tar.gz (restore_db puts them back);
a daily sweep deletes files no row points to (after restore_db, import_snapshot or a failed upload).
"""

import secrets
import time
from pathlib import Path

from django.conf import settings
from django.db import transaction
from PIL import Image, ImageOps, UnidentifiedImageError

from .views import player_of

MAX_BYTES = 10 * 1024 * 1024
# a phone screenshot is ~3–4 Mpx; a bigger image is no screenshot and costs a lot of memory to decode
MAX_PIXELS = 16_000_000
MAX_SIDE = 2400
THUMB_SIDE = 480
FORMATS = {'JPEG', 'PNG', 'WEBP'}
FOLDERS = ('kvk', 'marches')
# a file younger than this may belong to an upload whose row is not written yet
SWEEP_GRACE_SECONDS = 3600


class BadImage(ValueError):
    """code: 'too_big' | 'not_image'"""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def root() -> Path:
    return Path(settings.PRIVATE_MEDIA_ROOT)


def can_review(user) -> bool:
    """The superuser and the players the superuser marked as reviewers see every player's screenshots."""
    if not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    player = player_of(user)
    return bool(player and player.kvk_reviewer)


def store(upload, folder: str) -> tuple[str, str, int, int]:
    """Decodes the upload and writes it again as WebP (max MAX_SIDE) plus a thumbnail. Returns (path, thumb, width,
    height) relative to PRIVATE_MEDIA_ROOT. Raises BadImage."""
    if upload.size > MAX_BYTES:
        raise BadImage('too_big')
    try:
        image = Image.open(upload)
        if image.format not in FORMATS or image.width * image.height > MAX_PIXELS:
            raise BadImage('not_image')
        if image.format == 'JPEG':
            image.draft('RGB', (MAX_SIDE, MAX_SIDE))  # decode a big JPEG at a smaller size straight away
        image.load()
        image = ImageOps.exif_transpose(image)
        image.thumbnail((MAX_SIDE, MAX_SIDE))
        image = image.convert('RGB')
    except BadImage:
        raise
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError, Image.DecompressionBombError) as exc:
        raise BadImage('not_image') from exc
    # nothing of the original goes into the new file (exif, xmp, icc_profile…)
    image.info.clear()
    directory = root() / folder
    directory.mkdir(parents=True, exist_ok=True)
    name = secrets.token_hex(16)
    path, thumb = f'{folder}/{name}.webp', f'{folder}/{name}-t.webp'
    image.save(root() / path, 'WEBP', quality=82, method=4)
    small = image.copy()
    small.thumbnail((THUMB_SIDE, THUMB_SIDE))
    small.save(root() / thumb, 'WEBP', quality=72, method=4)
    return path, thumb, image.width, image.height


def unlink(*relative: str) -> None:
    for name in relative:
        if name:
            (root() / name).unlink(missing_ok=True)


def unlink_on_commit(*relative: str) -> None:
    """After the transaction: a rolled-back delete keeps its rows, so it must keep their files too."""
    transaction.on_commit(lambda: unlink(*relative))


def sweep(referenced: set[str], now: float | None = None) -> int:
    """Deletes the files in FOLDERS that no row references and that are older than SWEEP_GRACE_SECONDS."""
    now = now or time.time()
    deleted = 0
    for folder in FOLDERS:
        directory = root() / folder
        if not directory.is_dir():
            continue
        for file in directory.iterdir():
            relative = f'{folder}/{file.name}'
            if relative in referenced or now - file.stat().st_mtime < SWEEP_GRACE_SECONDS:
                continue
            file.unlink(missing_ok=True)
            deleted += 1
    return deleted


def serve(relative: str):
    """The file as a private, briefly cached response (no never_cache: the reviewers' list shows many thumbnails)."""
    from django.http import FileResponse, Http404

    try:
        response = FileResponse((root() / relative).open('rb'), content_type='image/webp')
    except FileNotFoundError as exc:
        raise Http404 from exc
    response['Cache-Control'] = 'private, max-age=600'
    response['X-Robots-Tag'] = 'noindex'
    response['Content-Disposition'] = 'inline'
    return response

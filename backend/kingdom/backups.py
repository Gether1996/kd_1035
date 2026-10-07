"""Consistent SQLite + uploads backups (safe while the site is running)."""

import gzip
import shutil
import sqlite3
import tarfile
from datetime import datetime, timedelta
from pathlib import Path

from django.conf import settings
from django.db import connection
from django.utils import timezone

PREFIX = 'kd1035_'


def _connect_db() -> sqlite3.Connection:
    name = str(settings.DATABASES['default']['NAME'])
    # the test runner uses a shared in-memory database addressed by a file: URI
    return sqlite3.connect(name, uri=name.startswith('file:'))


def latest_backup_time(folder: Path) -> datetime | None:
    files = sorted(folder.glob(f'{PREFIX}*.sqlite3.gz'))
    if not files:
        return None
    return datetime.fromtimestamp(files[-1].stat().st_mtime, tz=timezone.get_current_timezone())


def backup_due(folder: Path, interval_days: int) -> bool:
    last = latest_backup_time(folder)
    return last is None or timezone.now() - last >= timedelta(days=interval_days)


def create_backup(folder: Path, keep: int) -> Path:
    """Writes kd1035_<time>.sqlite3.gz (+ _uploads.tar.gz when there are uploads) and prunes old ones."""
    folder.mkdir(parents=True, exist_ok=True)
    stamp = timezone.localtime().strftime('%Y-%m-%d_%H%M%S')
    raw = folder / f'{PREFIX}{stamp}.sqlite3'

    # SQLite online backup API – a consistent snapshot even while gunicorn writes
    source = _connect_db()
    target = sqlite3.connect(raw)
    try:
        source.backup(target)
    finally:
        target.close()
        source.close()

    archive = raw.with_suffix('.sqlite3.gz')
    with raw.open('rb') as src, gzip.open(archive, 'wb') as dst:
        shutil.copyfileobj(src, dst)
    raw.unlink()

    media = Path(settings.MEDIA_ROOT)
    if media.is_dir() and any(media.iterdir()):
        with tarfile.open(folder / f'{PREFIX}{stamp}_uploads.tar.gz', 'w:gz') as tar:
            tar.add(media, arcname='uploads')

    prune(folder, keep)
    return archive


def prune(folder: Path, keep: int) -> None:
    for pattern in (f'{PREFIX}*.sqlite3.gz', f'{PREFIX}*_uploads.tar.gz'):
        for old in sorted(folder.glob(pattern))[:-keep]:
            old.unlink()


def restore_backup(archive: Path) -> None:
    """Replaces the live database with the content of a .sqlite3.gz backup."""
    tmp = archive.with_name(archive.name.removesuffix('.gz') + '.restore')
    with gzip.open(archive, 'rb') as src, tmp.open('wb') as dst:
        shutil.copyfileobj(src, dst)
    try:
        source = sqlite3.connect(tmp)
        try:
            if source.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                raise ValueError(f'{archive.name} je poškodená')
            connection.close()
            target = _connect_db()
            try:
                source.backup(target)
            finally:
                target.close()
        finally:
            source.close()
    finally:
        tmp.unlink(missing_ok=True)

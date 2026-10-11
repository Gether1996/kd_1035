"""Consistent backups of the SQLite database, the uploads and the players' private screenshots (safe while the site
is running). Three files per backup: kd1035_<time>.sqlite3.gz, _uploads.tar.gz and _private.tar.gz (Gether 11. 10. 2026:
the screenshots of marches and KvK sign-ups are backed up too); BACKUP_KEEP of each are kept."""

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
# the live database just before restore_db replaced it (outside the PREFIX pattern: never counted as a backup)
PRE_RESTORE = 'pre-restore_'
# backups hold personal data: only the owner (app) may read them
MODE = 0o600


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
    """Writes kd1035_<time>.sqlite3.gz (+ _uploads.tar.gz and _private.tar.gz when there are such files) and prunes
    old ones."""
    folder.mkdir(parents=True, exist_ok=True)
    stamp = _stamp()
    archive = _write_database(folder / f'{PREFIX}{stamp}.sqlite3.gz')

    media = Path(settings.MEDIA_ROOT)
    if media.is_dir() and any(media.iterdir()):
        _write_tar(folder / f'{PREFIX}{stamp}_uploads.tar.gz', media, 'uploads')

    # the screenshots of marches and KvK sign-ups (already WebP – gzip gains little, but keeps one format)
    private = Path(settings.PRIVATE_MEDIA_ROOT)
    if private.is_dir() and any(private.rglob('*.webp')):
        _write_tar(folder / f'{PREFIX}{stamp}_private.tar.gz', private, 'private')

    prune(folder, keep)
    return archive


def pre_restore_copy(folder: Path) -> Path:
    """pre-restore_kd1035_<time>.sqlite3.gz: the live database before restore_db replaces it (a wrong backup picked
    by mistake can be undone). Deleted with the backups of its age (prune)."""
    folder.mkdir(parents=True, exist_ok=True)
    return _write_database(folder / f'{PRE_RESTORE}{PREFIX}{_stamp()}.sqlite3.gz')


def _stamp() -> str:
    return timezone.localtime().strftime('%Y-%m-%d_%H%M%S')


def _write_database(archive: Path) -> Path:
    raw = archive.with_name(archive.name.removesuffix('.gz'))
    # SQLite online backup API – a consistent snapshot even while gunicorn writes
    source = _connect_db()
    target = sqlite3.connect(raw)
    try:
        source.backup(target)
    finally:
        target.close()
        source.close()
    with raw.open('rb') as src, gzip.open(archive, 'wb') as dst:
        shutil.copyfileobj(src, dst)
    raw.unlink()
    archive.chmod(MODE)
    return archive


def _write_tar(archive: Path, root: Path, arcname: str) -> None:
    with tarfile.open(archive, 'w:gz') as tar:
        tar.add(root, arcname=arcname)
    archive.chmod(MODE)


def prune(folder: Path, keep: int) -> None:
    """The last `keep` database backups stay, with the uploads and screenshots archives of the same time; an archive
    of an older backup goes even when no newer archive was written (no screenshots left), so deleted data leaves the
    backups within keep × interval (the privacy page)."""
    databases = sorted(folder.glob(f'{PREFIX}*.sqlite3.gz'))
    for old in databases[:-keep]:
        old.unlink()
    kept = {path.name.removesuffix('.sqlite3.gz') for path in databases[-keep:]} if keep else set()
    for suffix in ('_uploads.tar.gz', '_private.tar.gz'):
        for archive in folder.glob(f'{PREFIX}*{suffix}'):
            if archive.name.removesuffix(suffix) not in kept:
                archive.unlink()
    # a safety copy from restore_db lives as long as a backup does (keep × interval, the privacy page)
    oldest = timezone.now() - timedelta(days=max(keep, 1) * settings.BACKUP_INTERVAL_DAYS)
    for copy in folder.glob(f'{PRE_RESTORE}*.sqlite3.gz'):
        if datetime.fromtimestamp(copy.stat().st_mtime, tz=timezone.get_current_timezone()) < oldest:
            copy.unlink()


def private_archive(archive: Path) -> Path:
    """kd1035_<time>.sqlite3.gz → kd1035_<time>_private.tar.gz of the same backup"""
    return archive.with_name(archive.name.removesuffix('.sqlite3.gz') + '_private.tar.gz')


def restore_private(archive: Path) -> int:
    """Puts the screenshots of a _private.tar.gz back next to the database. Files are added (their names are random),
    nothing is overwritten; the daily sweep_files removes the ones no row points to. Returns the number of files."""
    root = Path(settings.PRIVATE_MEDIA_ROOT)
    root.mkdir(parents=True, exist_ok=True)
    count = 0
    with tarfile.open(archive, 'r:gz') as tar:
        for member in tar.getmembers():
            name = Path(member.name)
            if not member.isfile() or name.parts[:1] != ('private',) or '..' in name.parts:
                continue
            target = root.joinpath(*name.parts[1:])
            if target.exists():
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with tar.extractfile(member) as src, target.open('wb') as dst:
                shutil.copyfileobj(src, dst)
            count += 1
    return count


def restore_backup(archive: Path) -> None:
    """Replaces the live database with the content of a .sqlite3.gz backup."""
    tmp = archive.with_name(archive.name.removesuffix('.gz') + '.restore')
    with gzip.open(archive, 'rb') as src, tmp.open('wb') as dst:
        shutil.copyfileobj(src, dst)
    try:
        restore_database(tmp, label=archive.name)
    finally:
        tmp.unlink(missing_ok=True)


def restore_database(path: Path, label: str = '') -> None:
    """Replaces the live database with a plain SQLite file (checked first, copied via the backup API)."""
    source = sqlite3.connect(path)
    try:
        if source.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise ValueError(f'{label or path.name} je poškodená')
        connection.close()
        target = _connect_db()
        try:
            source.backup(target)
        finally:
            target.close()
    finally:
        source.close()

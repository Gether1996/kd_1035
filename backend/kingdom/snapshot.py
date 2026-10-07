"""Database snapshot committed to git, so the whole content moves between dev machines with push/pull.

The snapshot is a plain SQLite copy of the live database without login sessions and without players signed in
with Discord (personal data, see remove_players). Every machine remembers
which snapshot its database was last synced with (SNAPSHOT_BASE_PATH, next to the database), so an export
from a database that missed a pulled snapshot is refused instead of silently overwriting newer content.
"""

import hashlib
import sqlite3
from pathlib import Path

from django.conf import settings

from .backups import _connect_db, restore_database


class SnapshotOutdated(Exception):
    pass


def file_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_base() -> str:
    base = Path(settings.SNAPSHOT_BASE_PATH)
    return base.read_text().strip() if base.is_file() else ''


def write_base(digest: str) -> None:
    base = Path(settings.SNAPSHOT_BASE_PATH)
    base.parent.mkdir(parents=True, exist_ok=True)
    base.write_text(digest)


def _tables(conn: sqlite3.Connection) -> set[str]:
    return {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}


def _dump(path: Path) -> str:
    conn = sqlite3.connect(path)
    try:
        return '\n'.join(conn.iterdump())
    finally:
        conn.close()


def remove_players(conn: sqlite3.Connection) -> None:
    """Players signed in with Discord are personal data of this machine – they never go into git.

    Removes every accounts_* row and the discord_<id> users with everything that points to them. The raw
    sqlite3 connection does not enforce foreign keys, so the dependent rows are deleted explicitly.
    """
    tables = _tables(conn)
    if 'auth_user' not in tables:
        return
    accounts = sorted(t for t in tables if t.startswith('accounts_'))
    who = r"username LIKE 'discord\_%' ESCAPE '\'"
    if 'accounts_player' in tables:
        who += ' OR id IN (SELECT user_id FROM accounts_player)'
    users = f'SELECT id FROM auth_user WHERE {who}'

    touched = []
    if 'django_admin_log' in tables:
        # entries about players or Discord users name them in object_repr, whoever made the change
        conn.execute(
            'DELETE FROM django_admin_log WHERE content_type_id IN '
            "(SELECT id FROM django_content_type WHERE app_label = 'accounts') "
            'OR (content_type_id IN '
            "(SELECT id FROM django_content_type WHERE app_label = 'auth' AND model = 'user') "
            f'AND object_id IN (SELECT CAST(id AS TEXT) FROM auth_user WHERE {who}))'
        )
    for table in ('django_admin_log', 'auth_user_groups', 'auth_user_user_permissions'):
        if table in tables:
            conn.execute(f'DELETE FROM {table} WHERE user_id IN ({users})')
            touched.append(table)
    conn.execute(f'DELETE FROM auth_user WHERE id IN ({users})')
    for table in accounts:
        conn.execute(f'DELETE FROM "{table}"')
    # AUTOINCREMENT counters would still change with every local sign-in (noise in git)
    if 'sqlite_sequence' in tables:
        for table in ['auth_user', *touched, *accounts]:
            conn.execute(
                f'UPDATE sqlite_sequence SET seq = (SELECT IFNULL(MAX(id), 0) FROM "{table}") WHERE name = ?', [table]
            )


def database_is_empty() -> bool:
    conn = _connect_db()
    try:
        return 'django_migrations' not in _tables(conn)
    finally:
        conn.close()


def export_snapshot(force: bool = False) -> bool:
    """Writes the live database to SNAPSHOT_PATH. Returns False when the content did not change."""
    target = Path(settings.SNAPSHOT_PATH)
    if target.is_file() and not force and file_hash(target) != read_base():
        raise SnapshotOutdated(
            f'{target.name} v repozitári je novší ako tvoja lokálna databáza (napr. po pulle bez importu). '
            'Najprv ho načítaj (import_snapshot), alebo ho prepíš svojou databázou (export_snapshot --force).'
        )
    if database_is_empty():
        raise ValueError('Lokálna databáza je prázdna (bez migrácií), nie je čo exportovať.')

    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_name(target.name + '.tmp')
    tmp.unlink(missing_ok=True)
    dest = sqlite3.connect(tmp)
    try:
        source = _connect_db()
        try:
            source.backup(dest)
        finally:
            source.close()
        # login sessions belong to each machine, they would only add noise (and secrets) to git
        if 'django_session' in _tables(dest):
            dest.execute('DELETE FROM django_session')
        remove_players(dest)
        dest.commit()
        dest.execute('PRAGMA journal_mode = DELETE')
        dest.execute('VACUUM')
    finally:
        dest.close()

    # the file bytes differ on every copy – keep the committed one when the data is the same
    changed = not target.is_file() or _dump(target) != _dump(tmp)
    if changed:
        tmp.replace(target)
    else:
        tmp.unlink()
    write_base(file_hash(target))
    return changed


def import_snapshot() -> Path:
    """Replaces the live database with SNAPSHOT_PATH."""
    source = Path(settings.SNAPSHOT_PATH)
    if not source.is_file():
        raise FileNotFoundError(f'{source} neexistuje')
    restore_database(source)
    write_base(file_hash(source))
    return source

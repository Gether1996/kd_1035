"""Overview panel on the admin start page: is the worker alive, how old is the last backup, what goes out next.

The worker writes a small heartbeat file (WORKER_STATUS_PATH, next to the database) every tick instead of a DB row,
so the git snapshot does not change every 30 s. The backup time comes from that file too – on the server only the
worker has the backup folder mounted, the backend (which renders the admin) does not. The same file carries what the
operations alerts (alerts.py) already told the superadmin, and `ops()` gives the superadmin's header the red "!".
"""

import json
import logging
import os
import tempfile
from datetime import datetime, timedelta
from pathlib import Path

from django.conf import settings
from django.urls import reverse
from django.utils import timezone

from accounts.models import SentReminder

from .backups import PREFIX
from .models import EventNotification

log = logging.getLogger(__name__)

# the worker ticks every 30 s – four missed ticks mean it is not running
WORKER_STALE = timedelta(minutes=2)
# a weekly backup may be a day late (the worker checks once an hour, restarts reset the check)
BACKUP_GRACE = timedelta(days=1)
NEXT_NOTIFICATIONS = 5
FAILED_WINDOW = timedelta(days=7)
# settings shown as set / missing – booleans only, never the value
CONFIG_FLAGS = ['DISCORD_WEBHOOK_URL', 'DISCORD_EVENT_ROLE_ID', 'DISCORD_BOT_TOKEN']


def status_path() -> Path:
    return Path(settings.WORKER_STATUS_PATH)


def read_status() -> dict | None:
    try:
        data = json.loads(status_path().read_text())
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) else None


def _parse(value) -> datetime | None:
    try:
        return datetime.fromisoformat(value) if value else None
    except (TypeError, ValueError):
        return None


class Heartbeat:
    """What the worker last did, written atomically (temp file in the same folder + os.replace) every tick.

    The last backup survives restarts: the existing file is read at start-up and a newer backup in the folder
    (e.g. a manual backup_db) wins. A write that fails is logged once and never stops the worker. The operations
    alerts (alerts.py) keep their state here too, so a restart neither repeats an alert nor reports old failures; a
    file from before them (no such keys) reads as nothing alerted and no failures known yet.
    """

    def __init__(self, backup_folder: Path | None = None):
        previous = read_status() or {}
        self.last_backup_at = _parse(previous.get('last_backup_at'))
        self.last_backup_file = previous.get('last_backup_file') or ''
        # the last backup attempt raised (cleared by the next backup written)
        self.backup_error = str(previous.get('backup_error') or '')
        # alert kind → when the superadmin was last told (ISO time)
        alerted = previous.get('alerted')
        self.alerted = {k: v for k, v in alerted.items() if isinstance(v, str)} if isinstance(alerted, dict) else {}
        # the failed channel notifications already known; None = not checked yet (the first check only takes them in)
        failed = previous.get('failed_ids')
        self.failed_ids = [i for i in failed if isinstance(i, int)] if isinstance(failed, list) else None
        if backup_folder is not None:
            self._adopt_latest(backup_folder)
        self.failing = False

    def _adopt_latest(self, folder: Path) -> None:
        try:
            files = sorted(folder.glob(f'{PREFIX}*.sqlite3.gz'))
            if not files:
                return
            at = datetime.fromtimestamp(files[-1].stat().st_mtime, tz=timezone.get_current_timezone())
        except OSError:
            return
        if self.last_backup_at is None or at > self.last_backup_at:
            self.last_backup_at, self.last_backup_file = at, files[-1].name

    def backup_written(self, archive: Path) -> None:
        self.last_backup_at, self.last_backup_file = timezone.now(), archive.name
        self.backup_error = ''
        self.tick()

    def backup_failed(self, exc: Exception) -> None:
        self.backup_error = (str(exc) or exc.__class__.__name__)[:300]

    def tick(self) -> bool:
        data = {
            'last_tick': timezone.now().isoformat(),
            'last_backup_at': self.last_backup_at.isoformat() if self.last_backup_at else None,
            'last_backup_file': self.last_backup_file,
            'backup_error': self.backup_error,
            'alerted': self.alerted,
            'failed_ids': self.failed_ids,
        }
        path = status_path()
        try:
            fd, tmp = tempfile.mkstemp(dir=path.parent, prefix='.worker_status.', suffix='.tmp')
            try:
                with os.fdopen(fd, 'w') as f:
                    json.dump(data, f)
                os.chmod(tmp, 0o644)  # mkstemp creates 0600; the backend reads it
                os.replace(tmp, path)
            except BaseException:
                Path(tmp).unlink(missing_ok=True)
                raise
        except OSError as exc:
            if not self.failing:
                log.warning('Cannot write the worker status %s: %s', path, exc)
            self.failing = True
            return False
        self.failing = False
        return True


def age(delta: timedelta) -> str:
    """Short age for the panel: '45 min', '18 h', '9 d 3 h' (Django's timesince declines Slovak hours wrong)."""
    minutes = max(int(delta.total_seconds() // 60), 0)
    if minutes < 60:
        return f'{minutes} min'
    hours = minutes // 60
    if hours < 48:
        return f'{hours} h'
    return f'{hours // 24} d {hours % 24} h' if hours % 24 else f'{hours // 24} d'


def worker_state(status: dict | None, now: datetime) -> dict:
    last = _parse((status or {}).get('last_tick'))
    if last is None:
        return {'state': 'missing', 'at': None, 'age': ''}
    return {'state': 'ok' if now - last < WORKER_STALE else 'stale', 'at': last, 'age': age(now - last)}


def backup_state(status: dict | None, now: datetime) -> dict:
    at = _parse((status or {}).get('last_backup_at'))
    if at is None:
        return {'state': 'missing', 'at': None, 'age': '', 'file': ''}
    old = now - at > timedelta(days=settings.BACKUP_INTERVAL_DAYS) + BACKUP_GRACE
    return {
        'state': 'old' if old else 'ok',
        'at': at,
        'age': age(now - at),
        'file': (status or {}).get('last_backup_file') or '',
    }


def failed_notifications(now: datetime):
    """Channel notifications that failed in the last FAILED_WINDOW (the panel, the header and the alerts)."""
    return EventNotification.objects.filter(status=EventNotification.Status.FAILED, send_at__gte=now - FAILED_WINDOW)


def ops(now: datetime | None = None) -> dict:
    """The superadmin's header (/api/auth/me/): something the admin overview shows is wrong – a file read and one
    count. It also covers a worker that is not running, which the worker itself cannot report (alerts.py)."""
    now = now or timezone.now()
    status = read_status()
    return {
        'worker_stale': worker_state(status, now)['state'] != 'ok',
        'backup_stale': backup_state(status, now)['state'] == 'old' or bool((status or {}).get('backup_error')),
        'failed': failed_notifications(now).count(),
    }


def overview(now: datetime | None = None) -> dict:
    now = now or timezone.now()
    status = read_status()
    notifications = reverse('admin:kingdom_eventnotification_changelist')
    pending = EventNotification.objects.filter(status=EventNotification.Status.PENDING).order_by('send_at')
    pending = pending.only('title', 'send_at')[:NEXT_NOTIFICATIONS]
    return {
        'worker': worker_state(status, now),
        'backup': backup_state(status, now),
        'backup_interval': settings.BACKUP_INTERVAL_DAYS,
        'pending': [
            {
                'title': n.title,
                'send_at': n.send_at,
                'url': reverse('admin:kingdom_eventnotification_change', args=[n.pk]),
            }
            for n in pending
        ],
        'pending_url': f'{notifications}?status__exact={EventNotification.Status.PENDING}',
        'failed': failed_notifications(now).count(),
        'failed_url': f'{notifications}?status__exact={EventNotification.Status.FAILED}',
        # a claimed row without an error is still being sent
        'reminders_failed': SentReminder.objects.filter(ok=False, sent_at__gte=now - FAILED_WINDOW)
        .exclude(error='')
        .count(),
        'reminders_url': reverse('admin:accounts_sentreminder_changelist') + '?ok__exact=0',
        'config': [(name, bool(getattr(settings, name, ''))) for name in CONFIG_FLAGS],
    }

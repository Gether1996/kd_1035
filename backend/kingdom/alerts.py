"""Operations alerts (Gether's round of agents, 3. 11. 2026): the superadmin learns about a failed backup or a failed
channel post from a Discord DM of the bot, without opening the admin overview.

After every tick the worker checks:
- `backup` – the last backup is older than BACKUP_INTERVAL_DAYS + BACKUP_GRACE, or the last backup attempt raised,
- `failed` – a channel notification (EventNotification) turned FAILED since the last check.

Each kind goes to every ID in DISCORD_ADMIN_IDS at most once per ALERT_EVERY; what was told and which failures are
known is kept in the worker's status file (overview.Heartbeat), written in the tick's one atomic write, so a restart
repeats nothing and the first check only takes in the failures that already exist. A worker that is not running cannot
send anything – that case shows as the red "!" in the superadmin's header (overview.ops). Failed personal reminders
are left out: a player who blocks DMs would make them noisy. A DM that fails never stops the worker.
"""

import logging
from datetime import datetime, timedelta

from django.conf import settings
from django.utils import timezone

from accounts import discord_bot
from accounts.newcomers import plain

from .overview import Heartbeat, _parse, age, backup_state, failed_notifications

log = logging.getLogger(__name__)

ALERT_EVERY = timedelta(hours=24)
# no admin got the DM (Discord down, bot blocked): the next try in an hour, not every tick
RETRY_AFTER = timedelta(hours=1)
# the titles named in one message
TITLES = 5


def admin_url() -> str:
    return f'{settings.SITE_URL}/admin/' if settings.SITE_URL else ''


def backup_text(heartbeat: Heartbeat, now: datetime) -> str:
    """Why the backup is not all right, '' when it is."""
    if heartbeat.backup_error:
        return f'Posledný pokus o zálohu databázy zlyhal: {plain(heartbeat.backup_error)}'
    at = heartbeat.last_backup_at
    if backup_state({'last_backup_at': at.isoformat() if at else None}, now)['state'] == 'old':
        return (
            f'Posledná záloha databázy je stará {age(now - at)}, '
            f'worker ju má robiť každých {settings.BACKUP_INTERVAL_DAYS} dní.'
        )
    return ''


def failed_text(heartbeat: Heartbeat, now: datetime) -> str:
    """The channel notifications that failed since the last check, '' when none. Updates the known failures."""
    failed = list(failed_notifications(now).order_by('send_at').values_list('pk', 'title'))
    known = heartbeat.failed_ids
    heartbeat.failed_ids = [pk for pk, _ in failed]
    if known is None:
        return ''  # the first check: what failed before is history
    new = [title for pk, title in failed if pk not in set(known)]
    if not new:
        return ''
    titles = ', '.join(plain(t) for t in new[:TITLES]) + (' …' if len(new) > TITLES else '')
    return f'Správa do Discord kanála zlyhala ({len(new)}): {titles}'


def notify(heartbeat: Heartbeat, kind: str, text: str, now: datetime) -> bool:
    """One DM of `kind` to every superadmin, unless they got one within ALERT_EVERY. Returns True when sent."""
    targets = sorted({str(i) for i in settings.DISCORD_ADMIN_IDS if i})
    if not targets or not discord_bot.enabled():
        return False
    last = _parse(heartbeat.alerted.get(kind))
    if last is not None and now - last < ALERT_EVERY:
        return False
    link = admin_url()
    content = f'**KD 1035 – prevádzka**\n{text}' + (f'\nPrehľad: {link}' if link else '')
    sent = False
    for target in targets:
        try:
            discord_bot.send_dm(target, {'content': content[:2000]})
            sent = True
        except Exception as exc:
            log.warning('Operations alert %s not sent to %s: %s', kind, target, exc)
    heartbeat.alerted[kind] = (now if sent else now - ALERT_EVERY + RETRY_AFTER).isoformat()
    return sent


def check(heartbeat: Heartbeat, now: datetime | None = None) -> int:
    """Called by the worker before heartbeat.tick(). Returns how many alerts went out."""
    now = now or timezone.now()
    count = 0
    for kind, text in (('backup', backup_text(heartbeat, now)), ('failed', failed_text(heartbeat, now))):
        if text and notify(heartbeat, kind, text, now):
            count += 1
    return count

import logging
import time
from pathlib import Path

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.db import close_old_connections

from kingdom.backups import backup_due, create_backup
from kingdom.discord import send_due
from kingdom.events import plan_reminders

log = logging.getLogger(__name__)

TICK_SECONDS = 30
PLAN_SECONDS = 300
BACKUP_CHECK_SECONDS = 3600
SESSION_CLEANUP_SECONDS = 24 * 3600


class Command(BaseCommand):
    help = (
        'Background loop: plans reminders of recurring kingdom events, sends due Discord notifications '
        'backs up the database every BACKUP_INTERVAL_DAYS and deletes expired sessions once a day.'
    )

    def handle(self, *args, **options):
        folder = Path(settings.BACKUP_DIR)
        log.info('Worker started (backups → %s every %s days)', folder, settings.BACKUP_INTERVAL_DAYS)
        next_plan = next_backup_check = next_session_cleanup = 0.0
        while True:
            close_old_connections()
            if time.monotonic() >= next_plan:
                next_plan = time.monotonic() + PLAN_SECONDS
                try:
                    if planned := plan_reminders():
                        log.info('Planned %s event reminders', planned)
                except Exception:
                    log.exception('Planning event reminders failed')

            try:
                send_due()
            except Exception:  # keep the loop alive – e.g. tables not migrated yet on first start
                log.exception('Sending notifications failed')

            if time.monotonic() >= next_backup_check:
                next_backup_check = time.monotonic() + BACKUP_CHECK_SECONDS
                try:
                    if backup_due(folder, settings.BACKUP_INTERVAL_DAYS):
                        log.info('Backup written: %s', create_backup(folder, settings.BACKUP_KEEP))
                except Exception:
                    log.exception('Backup failed')

            if time.monotonic() >= next_session_cleanup:
                next_session_cleanup = time.monotonic() + SESSION_CLEANUP_SECONDS
                try:
                    # expired logins (player user IDs) and unfinished Discord sign-ins would pile up, also in backups
                    call_command('clearsessions')
                except Exception:
                    log.exception('Clearing expired sessions failed')

            time.sleep(TICK_SECONDS)

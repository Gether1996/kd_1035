import logging
import time
from pathlib import Path

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.db import close_old_connections

from accounts.reminders import prune_sent, send_personal_reminders
from kingdom.backups import backup_due, create_backup
from kingdom.discord import send_due
from kingdom.events import plan_reminders
from kingdom.overview import Heartbeat

log = logging.getLogger(__name__)

TICK_SECONDS = 30
PLAN_SECONDS = 300
BACKUP_CHECK_SECONDS = 3600
SESSION_CLEANUP_SECONDS = 24 * 3600


class Command(BaseCommand):
    help = (
        'Background loop: plans reminders of recurring kingdom events, sends due Discord notifications and the '
        "players' personal reminders, backs up the database every BACKUP_INTERVAL_DAYS and deletes expired "
        'sessions and old reminder logs once a day.'
    )

    def handle(self, *args, **options):
        folder = Path(settings.BACKUP_DIR)
        log.info('Worker started (backups → %s every %s days)', folder, settings.BACKUP_INTERVAL_DAYS)
        heartbeat = Heartbeat(folder)  # keeps the last backup across restarts
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

            try:
                send_personal_reminders()
            except Exception:
                log.exception('Sending personal reminders failed')

            if time.monotonic() >= next_backup_check:
                next_backup_check = time.monotonic() + BACKUP_CHECK_SECONDS
                try:
                    if backup_due(folder, settings.BACKUP_INTERVAL_DAYS):
                        archive = create_backup(folder, settings.BACKUP_KEEP)
                        heartbeat.backup_written(archive)
                        log.info('Backup written: %s', archive)
                except Exception:
                    log.exception('Backup failed')

            if time.monotonic() >= next_session_cleanup:
                next_session_cleanup = time.monotonic() + SESSION_CLEANUP_SECONDS
                try:
                    # expired logins (player user IDs) and unfinished Discord sign-ins would pile up, also in backups
                    call_command('clearsessions')
                except Exception:
                    log.exception('Clearing expired sessions failed')
                try:
                    prune_sent()
                except Exception:
                    log.exception('Pruning sent reminders failed')

            heartbeat.tick()  # a file for the admin overview, never a DB write
            time.sleep(TICK_SECONDS)

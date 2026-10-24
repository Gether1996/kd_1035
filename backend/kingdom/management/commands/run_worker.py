import logging
import time
from pathlib import Path

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.db import close_old_connections
from django.utils import timezone

from accounts.alarms import prune_alarms, send_alarms
from accounts.cleanup import sweep_files
from accounts.evaluation_history import prune as prune_evaluation_history
from accounts.newcomers import announce_new_players, send_welcomes
from accounts.notices import send_march_notices
from accounts.reminders import DiscordPaused, prune_sent, send_personal_reminders
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
        "players' personal reminders, tells the superadmin about new players, backs up the database every "
        'BACKUP_INTERVAL_DAYS and deletes expired sessions and old reminder logs once a day.'
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

            try:
                send_alarms()
            except DiscordPaused:
                pass  # the rest waits for the next tick
            except Exception:
                log.exception('Sending alarms failed')

            try:
                # a player signing in for the first time waits for the superadmin – who gets a Discord DM about it
                announce_new_players(timezone.now())
            except DiscordPaused:
                pass
            except Exception:
                log.exception('Announcing new players failed')

            try:
                # ... and the player they approve gets a DM that they can start
                send_welcomes(timezone.now())
            except DiscordPaused:
                pass
            except Exception:
                log.exception('Sending welcomes to approved players failed')

            try:
                # the superadmin's notices about wrong pairs and formations in the players' marches
                send_march_notices(timezone.now())
            except DiscordPaused:
                pass
            except Exception:
                log.exception('Sending march notices failed')

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
                    prune_alarms()
                except Exception:
                    log.exception('Pruning sent reminders failed')
                try:
                    # the history of the KvK evaluation after 180 days (privacy page)
                    prune_evaluation_history()
                except Exception:
                    log.exception('Pruning the evaluation history failed')
                try:
                    # screenshot files without a row (privacy page)
                    sweep_files()
                except Exception:
                    log.exception('Sweeping screenshot files failed')

            heartbeat.tick()  # a file for the admin overview, never a DB write
            time.sleep(TICK_SECONDS)

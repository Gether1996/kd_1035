from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand

from kingdom.backups import create_backup


class Command(BaseCommand):
    help = 'Backs up the SQLite database (and uploads) into BACKUP_DIR right now.'

    def handle(self, *args, **options):
        archive = create_backup(Path(settings.BACKUP_DIR), settings.BACKUP_KEEP)
        self.stdout.write(self.style.SUCCESS(f'Backup written: {archive}'))

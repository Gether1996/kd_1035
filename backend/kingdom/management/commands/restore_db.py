from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from kingdom.backups import restore_backup


class Command(BaseCommand):
    help = 'Restores the database from a backup file (name inside BACKUP_DIR or a full path).'

    def add_arguments(self, parser):
        parser.add_argument('backup', help='e.g. kd1035_2026-10-07_120000.sqlite3.gz')

    def handle(self, *args, **options):
        archive = Path(options['backup'])
        if not archive.is_absolute():
            archive = Path(settings.BACKUP_DIR) / archive
        if not archive.is_file():
            raise CommandError(f'{archive} does not exist')
        restore_backup(archive)
        self.stdout.write(self.style.SUCCESS(f'Database restored from {archive.name}'))

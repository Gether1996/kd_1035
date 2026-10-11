from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from kingdom.backups import private_archive, restore_backup, restore_private


class Command(BaseCommand):
    help = (
        'Restores the database from a backup file (name inside BACKUP_DIR or a full path) and puts back the players\' '
        'screenshots of the same backup (_private.tar.gz), if there is one.'
    )

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
        screenshots = private_archive(archive)
        if screenshots.is_file():
            count = restore_private(screenshots)
            self.stdout.write(self.style.SUCCESS(f'Screenshots restored from {screenshots.name}: {count} files'))

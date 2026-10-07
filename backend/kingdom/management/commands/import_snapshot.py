from pathlib import Path

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand

from kingdom.backups import create_backup
from kingdom.snapshot import database_is_empty, import_snapshot


class Command(BaseCommand):
    help = 'Replaces the database with SNAPSHOT_PATH (run by the post-merge hook). Backs up the old one first.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--if-empty', action='store_true', help='Only when the database has no tables yet (fresh clone).'
        )

    def handle(self, *args, **options):
        snapshot = Path(settings.SNAPSHOT_PATH)
        if not snapshot.is_file():
            if not options['if_empty']:
                self.stderr.write(f'{snapshot} does not exist, nothing to import.')
            return

        empty = database_is_empty()
        if options['if_empty'] and not empty:
            return
        if not empty:
            backup = create_backup(Path(settings.BACKUP_DIR), settings.BACKUP_KEEP)
            self.stdout.write(f'Previous database backed up: {backup}')

        import_snapshot()
        # the snapshot may predate migrations that came with the same pull
        call_command('migrate', interactive=False, verbosity=0)
        call_command('sync_meta_guides')
        call_command('ensure_superuser')
        self.stdout.write(self.style.SUCCESS(f'Database imported from {snapshot.name}.'))

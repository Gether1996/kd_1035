from django.core.management.base import BaseCommand, CommandError

from kingdom.snapshot import SnapshotOutdated, export_snapshot


class Command(BaseCommand):
    help = 'Writes the database into SNAPSHOT_PATH (committed to git by the pre-commit hook).'

    def add_arguments(self, parser):
        parser.add_argument(
            '--force', action='store_true', help='Overwrite a newer snapshot that was never imported here.'
        )

    def handle(self, *args, **options):
        try:
            changed = export_snapshot(force=options['force'])
        except (SnapshotOutdated, ValueError) as error:
            raise CommandError(error) from error
        self.stdout.write('Database snapshot updated.' if changed else 'Database snapshot unchanged.')

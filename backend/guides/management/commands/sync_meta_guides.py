from django.core.management.base import BaseCommand

from guides.meta.sync import sync_guides


class Command(BaseCommand):
    help = 'Writes the guides from guides/meta into the database (only guides with auto_update=True are changed).'

    def handle(self, *args, **options):
        stats = sync_guides()
        self.stdout.write('Meta guides: {created} created, {updated} updated, {unpublished} unpublished.'.format(**stats))

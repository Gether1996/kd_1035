from django.core.management.base import BaseCommand

from kingdom.event_templates import create_templates


class Command(BaseCommand):
    help = 'Creates inactive draft kingdom events with the usual RoK rotation (MGE, Ark, Wheel, MTG…) – check and enable them in the admin.'

    def handle(self, *args, **options):
        created = create_templates()
        for name in created:
            self.stdout.write(f'+ {name}')
        self.stdout.write(f'{len(created)} draft events created (inactive) – check the dates in the admin and enable them.')

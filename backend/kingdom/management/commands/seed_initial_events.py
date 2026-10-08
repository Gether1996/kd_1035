from django.core.management.base import BaseCommand

from kingdom.event_templates import create_initial_events


class Command(BaseCommand):
    help = 'Creates the kingdom events from kingdom/initial_events.json that do not exist yet (first start of a new server).'

    def handle(self, *args, **options):
        created = create_initial_events()
        for name in created:
            self.stdout.write(f'+ {name}')
        self.stdout.write(f'{len(created)} kingdom events created.')

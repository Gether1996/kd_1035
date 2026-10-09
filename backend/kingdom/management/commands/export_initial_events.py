from django.core.management.base import BaseCommand

from kingdom.event_templates import INITIAL_EVENTS, export_initial_events


class Command(BaseCommand):
    help = 'Writes the events of the dev database into kingdom/initial_events.json (what a new server starts with).'

    def handle(self, *args, **options):
        count = export_initial_events()
        self.stdout.write(f'{count} kingdom events written to {INITIAL_EVENTS.name}.')

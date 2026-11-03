from types import SimpleNamespace

from django.core.management.base import BaseCommand

from accounts.models import KvkSignup, March
from accounts.pair_check import rare_excess
from guides import armory


class Command(BaseCommand):
    help = (
        'How many marches and KvK sign-ups were saved with two gold or blue inscriptions on one armament (before '
        'v1.56.6 allowed one) and of how many players. Only reads and prints counts – never a name.'
    )

    def handle(self, *args, **options):
        catalog = armory.inscriptions()
        for label, model in (('marches', March), ('sign-ups', KvkSignup)):
            # plain values, no model instance – nothing that could be saved
            rows = model.objects.values_list('player_id', 'inscriptions')
            bad = [player for player, chosen in rows if rare_excess(SimpleNamespace(inscriptions=chosen), catalog)]
            self.stdout.write(f'{label}: {len(bad)} (players: {len(set(bad))})')

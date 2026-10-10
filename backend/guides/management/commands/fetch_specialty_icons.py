import json
import re

from django.core.management.base import BaseCommand, CommandError

from guides.meta.render import SPECIALTY_DIR
from guides.models import Guide

from .fetch_commander_icons import PAGE, SOURCE
from .fetch_gear_icons import fetch, normalise

# rokstats.online reads the commander specialty tags from the game client (game art, used with consent, 8. 10. 2026):
# its commander catalog lists every tag with a slug ('infantry', 'garrison', …) and the small in-game icon (diamond)
# icons that are not commander tags – cut from Gether's screenshots, never downloaded
OWN = {Guide.Specialty.BARBARIAN_FORT}
CATALOG = re.compile(r'<script type="application/json" id="commander-catalog-data">(.*?)</script>', re.S)


class Command(BaseCommand):
    help = 'Downloads the specialty icons of the guide list into guides/static/guides/specialties (96×96 webp).'

    def handle(self, *args, **options):
        found = CATALOG.search(fetch(PAGE).decode())
        if not found:
            raise CommandError(f'No commander catalog on {PAGE}')
        tags = {tag['slug']: tag for tag in json.loads(found.group(1))['tags'].values()}
        SPECIALTY_DIR.mkdir(parents=True, exist_ok=True)
        missing = []
        for specialty in Guide.Specialty.values:
            if specialty in OWN:
                continue
            if specialty not in tags:
                missing.append(specialty)
                continue
            path = SPECIALTY_DIR / f'{specialty}.webp'
            normalise(fetch(SOURCE + tags[specialty]['icon'])).save(path, 'WEBP', quality=90, method=6)
            self.stdout.write(f'{specialty} → {path.name}')
        if missing:
            raise CommandError('No specialty tag on rokstats.online for: ' + ', '.join(missing))

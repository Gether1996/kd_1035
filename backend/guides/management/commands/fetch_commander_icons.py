import io
import re

from django.core.management.base import BaseCommand, CommandError
from PIL import Image

from guides.meta.render import COMMANDER_DIR, slug

from .fetch_gear_icons import SIZE, fetch

# rokstats.online reads the commanders from the game client (game art, used with Gether's consent);
# the portrait of each commander is /img/commanders/<heroId>/portrait
SOURCE = 'https://app.rokstats.online'
PAGE = SOURCE + '/commanders'
# the guides use the short in-game names – their rokstats slugs
ALIASES = {
    'Minamoto': 'minamoto-no-yoshitsune',
    'Richard': 'richard-i',
    'Ivar the Boneless': 'ivar',
    'Ragnar Prime': 'ragnar-lodbrok-prime',
}

# every portrait sits in the same 260×260 frame: this part keeps the face and the crown big at icon size
FACE = (0.18, 0.06, 0.82, 0.70)


def portrait(data):
    image = Image.open(io.BytesIO(data)).convert('RGBA')
    width, height = image.size
    box = (FACE[0] * width, FACE[1] * height, FACE[2] * width, FACE[3] * height)
    return image.crop(tuple(round(edge) for edge in box)).resize((SIZE, SIZE), Image.LANCZOS)


class Command(BaseCommand):
    help = 'Downloads commander portraits for the commander guides into guides/static/guides/commanders (96×96 webp).'

    def add_arguments(self, parser):
        parser.add_argument('names', nargs='+', help='commander names as written in guides/meta/commanders.py')

    def handle(self, *args, names, **options):
        heroes = {key: hero for hero, key in re.findall(r'"heroId":(\d+),"slug":"([a-z0-9-]+)"', fetch(PAGE).decode())}
        COMMANDER_DIR.mkdir(parents=True, exist_ok=True)
        missing = []
        for name in names:
            hero = heroes.get(ALIASES.get(name, slug(name)))
            if not hero:
                missing.append(name)
                continue
            path = COMMANDER_DIR / f'{slug(name)}.webp'
            portrait(fetch(f'{SOURCE}/img/commanders/{hero}/portrait')).save(path, 'WEBP', quality=88, method=6)
            self.stdout.write(f'{name} → {path.name}')
        if missing:
            raise CommandError('No portrait on rokstats.online for: ' + ', '.join(missing))

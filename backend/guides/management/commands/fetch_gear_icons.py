import io
import re
import urllib.request

from django.core.management.base import BaseCommand, CommandError
from PIL import Image

from guides.meta.render import GEAR_DIR, slug

# codexhelper.com ships every item icon as /_astro/<item_name>.<hash>.webp (game art, used with Gether's consent)
SOURCE = 'https://codexhelper.com'
PAGE = SOURCE + '/tools/equipment/'
SIZE, PAD = 96, 4


def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (KD 1035 guides)'})
    with urllib.request.urlopen(request, timeout=20) as response:
        return response.read()


def normalise(data):
    """Transparent edges trimmed, centred in a 96×96 square."""
    image = Image.open(io.BytesIO(data)).convert('RGBA')
    image = image.crop(image.getchannel('A').getbbox())
    image.thumbnail((SIZE - 2 * PAD, SIZE - 2 * PAD), Image.LANCZOS)
    icon = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    icon.paste(image, ((SIZE - image.width) // 2, (SIZE - image.height) // 2), image)
    return icon


class Command(BaseCommand):
    help = 'Downloads item icons for the equipment guides into guides/static/guides/gear (96×96 webp).'

    def add_arguments(self, parser):
        parser.add_argument('names', nargs='+', help='item names as written in guides/meta/equipment.py')

    def handle(self, *args, names, **options):
        assets = set(re.findall(r'/_astro/[a-z0-9_]+\.[A-Za-z0-9_-]+\.webp', fetch(PAGE).decode()))
        missing = []
        for name in names:
            key = slug(name).replace('-', '_')
            # the original asset is the shortest path; resized variants carry an extra suffix
            matches = [asset for asset in assets if asset.startswith(f'/_astro/{key}.')]
            if not matches:
                missing.append(name)
                continue
            path = GEAR_DIR / f'{slug(name)}.webp'
            normalise(fetch(SOURCE + min(matches, key=len))).save(path, 'WEBP', quality=88, method=6)
            self.stdout.write(f'{name} → {path.name}')
        if missing:
            raise CommandError('No icon on codexhelper.com for: ' + ', '.join(missing))

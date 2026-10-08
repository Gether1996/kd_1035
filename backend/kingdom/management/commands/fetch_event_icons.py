import io
import re

from django.core.management.base import BaseCommand, CommandError
from PIL import Image

from guides.management.commands.fetch_gear_icons import fetch
from kingdom.event_icons import ICON_DIR, ICONS, icon_path

# the calendar of codexhelper.com is a Svelte island; its bundle lists every event icon as /_astro/<file>.<hash>.webp
SOURCE = 'https://codexhelper.com'
PAGE = SOURCE + '/tools/calendar/'
SIZE, PAD = 96, 4


def fit(data):
    """Transparent edges trimmed, scaled (up or down) to fill a 96×96 square – some icons are only 40 px."""
    image = Image.open(io.BytesIO(data)).convert('RGBA')
    image = image.crop(image.getchannel('A').getbbox())
    scale = (SIZE - 2 * PAD) / max(image.size)
    image = image.resize((max(1, round(image.width * scale)), max(1, round(image.height * scale))), Image.LANCZOS)
    icon = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    icon.paste(image, ((SIZE - image.width) // 2, (SIZE - image.height) // 2), image)
    return icon


class Command(BaseCommand):
    help = 'Downloads event icons for the calendar and reminders into kingdom/static/kingdom/events (96×96 webp).'

    def add_arguments(self, parser):
        parser.add_argument(
            'slugs', nargs='*', help=f'icons to fetch (default: all from codexhelper): {", ".join(ICONS)}'
        )

    def handle(self, *args, slugs, **options):
        unknown = set(slugs) - set(ICONS)
        if unknown:
            raise CommandError('Unknown icon: ' + ', '.join(sorted(unknown)))
        page = fetch(PAGE).decode()
        bundle = re.search(r'component-url="(/_astro/Calendar\.[A-Za-z0-9_-]+\.js)"', page)
        if not bundle:
            raise CommandError('The calendar bundle is not on codexhelper.com any more.')
        assets = dict(
            re.findall(r'(/_astro/([a-z_]+)\.[A-Za-z0-9_-]+\.webp)', fetch(SOURCE + bundle.group(1)).decode())
        )
        files = {name: path for path, name in assets.items()}
        ICON_DIR.mkdir(parents=True, exist_ok=True)
        missing = []
        # icons cut out of screenshots by hand (no codexhelper file) are left alone
        for slug in slugs or [slug for slug, (name, _) in ICONS.items() if name]:
            source = files.get(ICONS[slug][0])
            if not source:
                missing.append(slug)
                continue
            fit(fetch(SOURCE + source)).save(icon_path(slug), 'WEBP', quality=88, method=6)
            self.stdout.write(f'{slug} ← {source}')
        if missing:
            raise CommandError('No icon on codexhelper.com for: ' + ', '.join(missing))

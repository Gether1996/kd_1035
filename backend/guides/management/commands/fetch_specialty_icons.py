import colorsys
import json
import re

from django.core.management.base import BaseCommand, CommandError
from PIL import Image

from guides.meta.render import CRIT_DIR, SPECIALTY_DIR
from guides.models import Guide

from .fetch_commander_icons import PAGE, SOURCE
from .fetch_gear_icons import fetch, normalise

# rokstats.online reads the commander specialty tags from the game client (game art, used with consent, 8. 10. 2026):
# its commander catalog lists every tag with a slug ('infantry', 'garrison', …) and the small in-game icon (diamond)
# icons that are not commander tags – cut from Gether's screenshots, never downloaded
OWN = {Guide.Specialty.BARBARIAN_FORT}
CATALOG = re.compile(r'<script type="application/json" id="commander-catalog-data">(.*?)</script>', re.S)

# the troop colours of the game's Armament Info (Gether 11. 11. 2026: "červené nechaj len archer, cav zelené a inf
# modré"): the game's red troop tags get the hue of their troops; siege and leadership, red in the game as well, get
# colours of their own so a red tag always means archers. (hue in degrees, brightness of the coloured badge – a green
# as bright as the game's red glares)
# The crit badge of the equipment keeps the game's red (Gether 11. 11. 2026): these tags are saved untouched to
# CRIT_DIR as well.
TINTS = {
    Guide.Specialty.INFANTRY: (207, 0.9),
    Guide.Specialty.CAVALRY: (128, 0.66),
    Guide.Specialty.ENGINEERING: (40, 0.92),
    Guide.Specialty.LEADERSHIP: (272, 0.92),
}
# the troops a crit badge can show (core/armory.ts marchTroop): infantry, cavalry, archers, siege, leadership
CRIT_TROOPS = (*TINTS, Guide.Specialty.ARCHER)
# the coloured badge – less saturated pixels are the light symbol and rim: they only take the hue
BADGE_SATURATION = 0.18
# grey and white pixels have no hue to change
GREY = 0.02
# a badge mostly this close to the hue was tinted already (webp is lossy and shifts the hue a little; the game red is
# far from every tint)
DONE = 20 / 360


def hue_distance(h: float, target: float) -> float:
    return min(abs(h - target), 1 - abs(h - target))


def tinted(image: Image.Image, hue: float) -> bool:
    """Most of the badge is of the hue already – the file was recoloured before (webp is lossy: saving it again would
    only blur it)."""
    target = hue / 360
    badge = [
        h
        for r, g, b, a in image.convert('RGBA').getdata()
        for h, s, _ in [colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)]
        if a and s >= BADGE_SATURATION
    ]
    return bool(badge) and sum(hue_distance(h, target) < DONE for h in badge) > len(badge) * 0.7


def tint(image: Image.Image, hue: float, brightness: float) -> Image.Image:
    """The badge gets the hue (and the brightness), the light symbol only the hue, greys stay."""
    image = image.convert('RGBA')
    target = hue / 360
    pixels = []
    for r, g, b, a in image.getdata():
        h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        if not a or s < GREY:
            pixels.append((r, g, b, a))
            continue
        if s >= BADGE_SATURATION:
            v *= brightness
        pixels.append((*(round(c * 255) for c in colorsys.hsv_to_rgb(target, s, v)), a))
    image.putdata(pixels)
    return image


def save(image: Image.Image, specialty: str) -> bool:
    """The tag (a troop tag in its colour) and the game's red copy for the crit badge. False = a troop tag recoloured
    before, left as it is."""
    if specialty in TINTS and tinted(image, TINTS[specialty][0]):
        return False
    if specialty in CRIT_TROOPS:
        CRIT_DIR.mkdir(parents=True, exist_ok=True)
        image.save(CRIT_DIR / f'{specialty}.webp', 'WEBP', quality=90, method=6)
    if specialty in TINTS:
        image = tint(image, *TINTS[specialty])
    image.save(SPECIALTY_DIR / f'{specialty}.webp', 'WEBP', quality=90, method=6)
    return True


class Command(BaseCommand):
    help = (
        'Downloads the specialty icons of the guide list into guides/static/guides/specialties (96×96 webp) and gives '
        'the troop tags the colours of their troops; --tint only recolours the files already there.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--tint', action='store_true', help='recolour the existing files, download nothing')

    def handle(self, *args, **options):
        if options['tint']:
            for specialty in TINTS:
                done = save(Image.open(SPECIALTY_DIR / f'{specialty}.webp'), specialty)
                self.stdout.write(f'{specialty} {"tinted" if done else "already tinted"}')
            return
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
            save(normalise(fetch(SOURCE + tags[specialty]['icon'])), specialty)
            self.stdout.write(f'{specialty} → {specialty}.webp')
        if missing:
            raise CommandError('No specialty tag on rokstats.online for: ' + ', '.join(missing))

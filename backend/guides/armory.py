"""Every equipment item and armament inscription a player can pick for a march on /marche (Gether 12. 10. 2026: "mať
v databáze všetky equipy, všetky typy formácií a ich inscriptions a človek si naklikne všetko").

The data is game data in code, like guides/meta: armory.json, written by `manage.py fetch_armory` – items, their stats
without and with a crit (special talent) and the sets from codexhelper.com/tools/equipment, the inscriptions of every
formation and the common ones from meta-rok.com. Rarity of an inscription: special (gold), rare (blue), common (white).
Item icons: guides/static/guides/gear/<id>.webp (game art from codexhelper.com, with Gether's consent).
"""

import json
from collections import Counter
from functools import cache
from pathlib import Path

ARMORY_FILE = Path(__file__).with_name('armory.json')
# formation icons (meta-rok.com, game art); every formation offered has one
FORMATION_DIR = Path(__file__).with_name('static') / 'guides' / 'formations'
# the game's equipment slots; a march has two accessories
SLOTS = ('weapon', 'helmet', 'chest', 'gloves', 'legs', 'boots', 'accessory')
MARCH_SLOTS = ('weapon', 'helmet', 'chest', 'gloves', 'legs', 'boots', 'accessory1', 'accessory2')
# iconic (awakening) level of an item: 0 = none, I–V
ICONIC_MAX = 5
# at most two inscriptions of each of the four armaments (Gether 12. 10. 2026)
MAX_PER_PIECE = 2
# of them at most one gold or blue: 2 white, gold + white or blue + white, never 2 gold or 2 blue (Gether 3. 11. 2026)
MAX_RARE_PER_PIECE = 1
MAX_INSCRIPTIONS = 4 * MAX_PER_PIECE
# the four armaments where the game's Armament screen has them (ARMAMENT_WHEEL in frontend/src/app/core/armory.ts)
PIECES = ('scroll', 'instrument', 'emblem', 'flag')


@cache
def armory():
    return json.loads(ARMORY_FILE.read_text(encoding='utf-8'))


@cache
def catalog():
    """/api/armory/: the data with the URL of each item's icon."""
    data = armory()
    return {
        **data,
        'items': [{**item, 'icon': f'/static/guides/gear/{item["id"]}.webp'} for item in data['items']],
        'formations': [{**f, 'icon': f'/static/guides/formations/{f["id"]}.webp'} for f in data['formations']],
    }


@cache
def items():
    return {item['id']: item for item in armory()['items']}


@cache
def formations():
    """formation id → the ids of its own inscriptions"""
    return {f['id']: {i['id'] for i in f['inscriptions']} for f in armory()['formations']}


@cache
def common_inscriptions():
    return {i['id'] for i in armory()['common']}


@cache
def inscriptions():
    """inscription id → {id, name, rarity, piece}"""
    data = armory()
    return {i['id']: i for i in [*data['common'], *(i for f in data['formations'] for i in f['inscriptions'])]}


def inscription_pieces():
    """inscription id → its armament (emblem, flag, instrument, scroll)"""
    return {key: i['piece'] for key, i in inscriptions().items()}


def rare_excess(chosen, catalog=None) -> list[str]:
    """The armaments with more than MAX_RARE_PER_PIECE gold or blue inscriptions among `chosen`, in PIECES order –
    one rule for saving (army.BuildSerializer refuses them) and for builds saved before it (pair_check.rare_excess).
    Ids the catalog no longer knows are skipped; `catalog` = inscriptions() read once by the caller."""
    catalog = inscriptions() if catalog is None else catalog
    rare = Counter(catalog[i]['piece'] for i in chosen if i in catalog and catalog[i]['rarity'] != 'common')
    return [piece for piece in PIECES if rare[piece] > MAX_RARE_PER_PIECE]


def piece_name(piece: str) -> str:
    """'emblem' → 'Emblem': the game's name of an armament, the same in both languages"""
    return piece.capitalize()


# the march's counts of inscriptions by colour (ArmyFields.gold, blue, white)
COLOURS = {'special': 'gold', 'rare': 'blue', 'common': 'white'}


def counts(chosen):
    """{'gold': 1, 'blue': 2, 'white': 3} of the inscriptions clicked together"""
    found = Counter(COLOURS[inscriptions()[i]['rarity']] for i in chosen)
    return {colour: found[colour] for colour in COLOURS.values()}


def slot_of(march_slot):
    """'accessory2' → 'accessory'"""
    return 'accessory' if march_slot.startswith('accessory') else march_slot

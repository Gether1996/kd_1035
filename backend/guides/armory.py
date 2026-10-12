"""Every equipment item and armament inscription a player can pick for a march on /marche (Gether 12. 10. 2026: "mať
v databáze všetky equipy, všetky typy formácií a ich inscriptions a človek si naklikne všetko").

The data is game data in code, like guides/meta: armory.json, written by `manage.py fetch_armory` – items, their stats
without and with a crit (special talent) and the sets from codexhelper.com/tools/equipment, the inscriptions of every
formation and the common ones from meta-rok.com. Rarity of an inscription: special (gold), rare (blue), common (white).
Item icons: guides/static/guides/gear/<id>.webp (game art from codexhelper.com, with Gether's consent).
"""

import json
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
MAX_INSCRIPTIONS = 4 * MAX_PER_PIECE


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
def inscription_pieces():
    """inscription id → its armament (emblem, flag, instrument, scroll)"""
    data = armory()
    return {i['id']: i['piece'] for i in [*data['common'], *(i for f in data['formations'] for i in f['inscriptions'])]}


def slot_of(march_slot):
    """'accessory2' → 'accessory'"""
    return 'accessory' if march_slot.startswith('accessory') else march_slot

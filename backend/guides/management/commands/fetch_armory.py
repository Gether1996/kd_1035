import json
import re
from datetime import date
from html import unescape

from django.core.management.base import BaseCommand, CommandError

from guides.armory import ARMORY_FILE, FORMATION_DIR, SLOTS
from guides.meta.render import GEAR_DIR, slug

from .fetch_gear_icons import SOURCE as CODEX, fetch, normalise

EQUIPMENT_PAGE = CODEX + '/tools/equipment/'
# meta-rok.com ships every armament inscription (formation, piece, rarity) in the props of its profile page
INSCRIPTION_PAGE = 'https://meta-rok.com/profile/'
# formation icons of meta-rok.com (game art); only these formations are offered – Double Line, Line, Staggered and
# Testudo have no icon there and stay out (Gether 12. 10. 2026)
FORMATION_ICONS = 'https://meta-rok.com/assets/formations/{}.webp'
FORMATION_FILES = {
    'arch': 'arch', 'circle': 'circle', 'delta': 'delta', 'echelon': 'echelon', 'hollow-square': 'hollow',
    'pincer': 'pincer', 'tercio': 'tercio', 'triple-line': 'tripleline', 'v': 'v', 'wedge': 'wedge',
}  # fmt: skip
RARITY = {'legendary': 'special', 'epic': 'rare', 'elite': 'common'}
PIECES = ('emblem', 'flag', 'instrument', 'scroll')


def js_value(page, name):
    """The JSON literal of `const <name> = …;` in the equipment page."""
    start = page.index(f'const {name} = ') + len(f'const {name} = ')
    return json.JSONDecoder().raw_decode(page, start)[0]


def astro(value):
    """Astro island props: every value is [type, value] – 0 plain (objects nested), 1 array."""
    if isinstance(value, list) and len(value) == 2 and isinstance(value[0], int):
        kind, inner = value
        if kind == 1:
            return [astro(v) for v in inner]
        if kind == 0 and isinstance(inner, dict):
            return {k: astro(v) for k, v in inner.items()}
        return inner
    if isinstance(value, dict):
        return {k: astro(v) for k, v in value.items()}
    return value


def nonzero(stats):
    return {key: value for key, value in (stats or {}).items() if value}


def equipment(page):
    items, ids = [], {}
    for raw in js_value(page, 'equipmentData'):
        if raw['slot'] not in SLOTS:
            raise CommandError(f'unknown slot {raw["slot"]} of {raw["name"]}')
        stats = nonzero(raw['stats'])
        # a crit (special talent) raises the stats it lists; the others stay
        crit = {**stats, **nonzero(raw.get('talent_stats'))}
        item = {
            'id': slug(raw['name']),
            'name': raw['name'],
            'slot': raw['slot'],
            'rarity': raw['quality'].lower(),
            'stats': stats,
            'crit': crit,
        }
        if raw.get('special_stats'):
            item['extra'] = raw['special_stats']
            item['extra_crit'] = raw.get('special_stats_talent') or raw['special_stats']
        ids[raw['id']] = item['id']
        items.append(item)
    if len({i['id'] for i in items}) != len(items):
        raise CommandError('two items with the same name')
    iconic = js_value(page, 'iconicData')
    for item in items:
        # every legendary item can be awakened, accessories too (Gether 12. 10. 2026) – codexhelper lists only some
        if item['name'] in iconic or item['rarity'] == 'legendary':
            item['iconic'] = True
    sets = [
        {
            'id': slug(raw['name']),
            'name': raw['name'],
            'pieces': [ids[piece] for piece in raw['pieces'] if piece in ids],
            'bonuses': [
                {'count': b['count'], 'text': b['description'], 'stats': nonzero(b.get('stats'))} for b in raw['bonuses']
            ],
        }
        for raw in js_value(page, 'equipmentSetData')
    ]
    for item_set in sets:
        for piece in item_set['pieces']:
            next(i for i in items if i['id'] == piece)['set'] = item_set['id']
    return items, sets


def inscriptions(page):
    props = None
    for attrs in re.findall(r'<astro-island([^>]*)>', page):
        if 'ProfilePage' in attrs:
            props = astro(json.loads(unescape(re.search(r'props="([^"]*)"', attrs).group(1))))
    if not props:
        raise CommandError('no inscriptions on ' + INSCRIPTION_PAGE)
    formations, common = {}, []
    for raw in props['inscriptions']:
        entry = {'id': raw['id'], 'name': raw['name'], 'rarity': RARITY[raw['rarity']], 'piece': raw['piece'].lower()}
        if entry['piece'] not in PIECES:
            raise CommandError(f'unknown armament piece {raw["piece"]}')
        if raw.get('formation'):
            # Wedge and Pincer have two kinds of armaments with more inscriptions, still one formation (Gether
            # 12. 10. 2026) – meta-rok's ids of the second kind say wedge-ii-…
            formations.setdefault(raw['formation'], []).append(entry)
        else:
            common.append(entry)
    rank = {'special': 0, 'rare': 1}
    return (
        [
            {'id': slug(name), 'name': name, 'inscriptions': sorted(found, key=lambda i: (PIECES.index(i['piece']), rank[i['rarity']]))}
            for name, found in sorted(formations.items())
            if slug(name) in FORMATION_FILES
        ],
        sorted(common, key=lambda i: (PIECES.index(i['piece']), i['name'])),
    )


class Command(BaseCommand):
    help = (
        'Downloads every equipment item (codexhelper.com) and armament inscription (meta-rok.com) into '
        'guides/armory.json and the icons of the items missing in guides/static/guides/gear.'
    )

    def handle(self, *args, **options):
        page = fetch(EQUIPMENT_PAGE).decode()
        items, sets = equipment(page)
        formations, common = inscriptions(fetch(INSCRIPTION_PAGE).decode())
        data = {
            'verified': date.today().strftime('%Y-%m'),
            'sources': [EQUIPMENT_PAGE, INSCRIPTION_PAGE],
            'items': items,
            'sets': sets,
            'formations': formations,
            'common': common,
        }
        ARMORY_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
        self.stdout.write(f'{len(items)} items, {len(sets)} sets, {len(formations)} formations, {len(common)} common inscriptions')

        assets = set(re.findall(r'/_astro/[a-z0-9_]+\.[A-Za-z0-9_-]+\.webp', page))
        missing = []
        for item in items:
            path = GEAR_DIR / f'{item["id"]}.webp'
            if path.exists():
                continue
            key = item['id'].replace('-', '_')
            matches = [asset for asset in assets if asset.startswith(f'/_astro/{key}.')]
            if not matches:
                missing.append(item['name'])
                continue
            normalise(fetch(CODEX + min(matches, key=len))).save(path, 'WEBP', quality=88, method=6)
            self.stdout.write(f'{item["name"]} → {path.name}')
        if missing:
            self.stderr.write('No icon on codexhelper.com for: ' + ', '.join(missing))

        FORMATION_DIR.mkdir(exist_ok=True)
        for formation in formations:
            path = FORMATION_DIR / f'{formation["id"]}.webp'
            if not path.exists():
                icon = normalise(fetch(FORMATION_ICONS.format(FORMATION_FILES[formation['id']])))
                icon.save(path, 'WEBP', quality=88, method=6)
                self.stdout.write(f'{formation["name"]} → {path.name}')

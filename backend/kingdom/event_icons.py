"""Event icons: game art from the event calendar of codexhelper.com (used with Gether's consent, 8. 10. 2026).

`manage.py fetch_event_icons` downloads them into kingdom/static/kingdom/events/<slug>.webp (96×96). Events the
calendar there does not have (Alliance Mobilization, Shadow Legion, Silk Road) got their icons cut out of Gether's
screenshots of the game. A KingdomEvent keeps the slug in `icon`; a new event gets one guessed from its name. An
event without an icon shows a monogram on the website.
"""

from pathlib import Path

from django.conf import settings

ICON_DIR = Path(__file__).resolve().parent / 'static' / 'kingdom' / 'events'

# our slug: (codexhelper file name, None = cut out of a screenshot by hand; label in the admin)
ICONS = {
    'alliance-mobilization': (None, 'Alliance Mobilization'),
    'shadow-legion': (None, 'Shadow Legion'),
    'silk-road': (None, 'Silk Road'),
    'mge': ('mge_icon', 'MGE'),
    'ark': ('ark', 'Ark of Osiris'),
    'wheel': ('wheel', 'Wheel of Fortune'),
    'mtg': ('mtg', 'More Than Gems'),
    'esmeralda': ('esmeralda_house', 'Esmeralda'),
    # the egg is Holy Knight's Treasure, the hammer Hunt for History – they take turns (codexhelper.com calendar)
    'egg': ('egg', "Holy Knight's Treasure (vajce)"),
    'egg-hammer': ('egg_hammer', "Holy Knight's Treasure / Hunt for History"),
    'hammer': ('hammer', 'Hunt for History (kladivo)'),
    'gold-head': ('legendary_head', '20 GH (zlatá hlava)'),
    'golden-kingdom': ('golden_kingdom', 'Golden Kingdom'),
    'ceroli': ('ceroli', 'Ceroli / Karuak'),
    'realm-of-mystique': ('realm_of_mystique', 'Realm of Mystique'),
    'armament': ('reveal', 'Armament, Reveal Thyself'),
    'dhalruk': ('dhalruk', "Dhalruk's Puzzle Box"),
    'olympia': ('olympia', 'Champions of Olympia'),
}

# lower-case part of the Slovak name → icon; the first match wins
GUESSES = [
    ('mge', 'mge'),
    ('mightiest governor', 'mge'),
    ('ark of osiris', 'ark'),
    ('wheel of fortune', 'wheel'),
    ('more than gems', 'mtg'),
    ('mtg', 'mtg'),
    ('esmeralda', 'esmeralda'),
    ('holy knight', 'egg'),
    ('hunt for history', 'hammer'),
    ('20 gh', 'gold-head'),
    ('gold head', 'gold-head'),
    ('golden kingdom', 'golden-kingdom'),
    # Kau Karuak leads the Ceroli (Ceroli Crisis is the old Karuak Ceremony)
    ('karuak', 'ceroli'),
    ('ceroli', 'ceroli'),
    ('realm of mystique', 'realm-of-mystique'),
    ('armament', 'armament'),
    ('dhalruk', 'dhalruk'),
    ('olympia', 'olympia'),
    ('alliance mobilization', 'alliance-mobilization'),
    ('shadow legion', 'shadow-legion'),
    ('silk road', 'silk-road'),
]


def guess(name: str) -> str:
    name = name.lower()
    return next((icon for part, icon in GUESSES if part in name), '')


def icon_path(slug: str) -> Path:
    return ICON_DIR / f'{slug}.webp'


def icon_url(slug: str) -> str | None:
    """/static/kingdom/events/<slug>.webp, or None when the event has no icon (or the file is missing)."""
    if slug not in ICONS or not icon_path(slug).exists():
        return None
    # a plain path like the guide icons (guides/meta/render.py): whitenoise serves it without the manifest
    return f'{settings.STATIC_URL}kingdom/events/{slug}.webp'


def choices() -> list[tuple[str, str]]:
    return [('', '— bez ikony (monogram) —')] + [
        (slug, label) for slug, (_, label) in ICONS.items() if icon_path(slug).exists()
    ]

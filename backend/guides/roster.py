"""Every commander a player can pick for a march on /marche (Gether 11. 10. 2026: players missed older commanders that
are not in the meta – "všetkých commanderov zo season 1 2 3 4, okrem zlatých kľúčov a gathering commanderov").

ROSTER = the legendary commanders of the game client (app.rokstats.online/commanders, data read from the client,
generated 26. 9. 2026) without those from the golden keys (the client lists the Tavern as their origin) and without
gathering commanders; Torgny and Wafura are left out (not released, release date 2080). Epic and elite commanders stay
out like before (all but Lohar, Keira and Diaochan come from the golden keys). Names are written like in our guides
(Richard, Minamoto, Ivar the Boneless), the second value is the rokstats slug of the portrait
(`manage.py fetch_commander_icons --roster`). Research: docs/commanderi-vyskum.md.

A commander of our guides is pickable too unless he is in EXCLUDED – so a commander the monthly meta update adds to
the guides (or one missing on rokstats, like Gonzalo de Cordoba) shows up without touching this file.
"""

import unicodedata

from .commander_index import commander_index
from .meta.render import COMMANDER_DIR, slug

ROSTER = [
    ('Achilles', 'achilles'),
    ('Aethelflaed', 'aethelflaed'),
    ('Afonso de Albuquerque', 'afonso-de-albuquerque'),
    ('Alexander Nevsky', 'alexander-nevsky'),
    ('Alexander the Great', 'alexander-the-great'),
    ('Alp Arslan', 'alp-arslan'),
    ('Amanitore', 'amanitore'),
    ('Archimedes', 'archimedes'),
    ('Artemisia I', 'artemisia-i'),
    ('Arthur Pendragon', 'arthur-pendragon'),
    ('Ashurbanipal', 'ashurbanipal'),
    ('Attila', 'attila'),
    ('Babur', 'babur'),
    ('Bai Qi', 'bai-qi'),
    ('Belisarius Prime', 'belisarius-prime'),
    ('Bertrand du Guesclin', 'bertrand-du-guesclin'),
    ('Boudica Prime', 'boudica-prime'),
    ('Chandragupta Maurya', 'chandragupta-maurya'),
    ('Charlemagne', 'charlemagne'),
    ('Cheok Jun-gyeong', 'cheok-jun-gyeong'),
    ('Choe Yeong', 'choe-yeong'),
    ('Constantine I', 'constantine-i'),
    ('Cyrus the Great', 'cyrus-the-great'),
    ('David IV', 'david-iv'),
    ('Dido', 'dido'),
    ('Edward of Woodstock', 'edward-of-woodstock'),
    ('Elizabeth I', 'elizabeth-i'),
    ('Flavius Aetius', 'flavius-aetius'),
    ('Gang Gamchan', 'gang-gamchan'),
    ('Genghis Khan', 'genghis-khan'),
    ('Gilgamesh', 'gilgamesh'),
    ('Gorgo', 'gorgo'),
    ('Guan Yu', 'guan-yu'),
    ('Hannibal Barca', 'hannibal-barca'),
    ('Harald Sigurdsson', 'harald-sigurdsson'),
    ('Hayam Wuruk', 'hayam-wuruk'),
    ('Hector', 'hector'),
    ('Henry V', 'henry-v'),
    ('Heraclius', 'heraclius'),
    ('Hermann Prime', 'hermann-prime'),
    ('Honda Tadakatsu', 'honda-tadakatsu'),
    ('Huo Qubing', 'huo-qubing'),
    ('Ivan IV', 'ivan-iv'),
    ('Ivar the Boneless', 'ivar'),
    ('Jadwiga', 'jadwiga'),
    ('Jan Žižka', 'jan-zizka'),
    ('Joan of Arc Prime', 'joan-of-arc-prime'),
    ('John Hunyadi', 'john-hunyadi'),
    ('Justinian I', 'justinian-i'),
    ("K'inich Janaab' Pakal", 'k-inich-janaab-pakal'),
    ('Leonidas I', 'leonidas-i'),
    ('Liu Che', 'liu-che'),
    ('Lu Bu', 'lu-bu'),
    ('Margaret I', 'margaret-i'),
    ('Mary I', 'mary-i'),
    ('Matthias I', 'matthias-i'),
    ('Minamoto', 'minamoto-no-yoshitsune'),
    ('Moctezuma I', 'moctezuma-i'),
    ('Nebuchadnezzar II', 'nebuchadnezzar-ii'),
    ('Philip II', 'philip-ii'),
    ('Qin Shi Huang', 'qin-shi-huang'),
    ('Ragnar Lodbrok Prime', 'ragnar-lodbrok-prime'),
    ('Ramesses II', 'ramesses-ii'),
    ('Richard', 'richard-i'),
    ('Saladin', 'saladin'),
    ('Sargon the Great', 'sargon-the-great'),
    ('Scipio Aemilianus', 'scipio-aemilianus'),
    ('Scipio Africanus Prime', 'scipio-africanus-prime'),
    ('Shajar al-Durr', 'shajar-al-durr'),
    ('Shapur I', 'shapur-i'),
    ("Siyaj K'ak'", 'siyaj-k-ak'),
    ('Stephen III', 'stephen-iii'),
    ('Subutai', 'subutai'),
    ('Suleiman I', 'suleiman-i'),
    ('Sun Tzu Prime', 'sun-tzu-prime'),
    ('Takeda Shingen', 'takeda-shingen'),
    ('Tariq ibn Ziyad', 'tariq-ibn-ziyad'),
    ('Theodora', 'theodora'),
    ('Tokugawa Ieyasu', 'tokugawa-ieyasu'),
    ('Tomyris', 'tomyris'),
    ('Trajan', 'trajan'),
    ('Vercingetorix', 'vercingetorix'),
    ('William I', 'william-i'),
    ('William Marshal', 'william-marshal'),
    ('William Wallace', 'william-wallace'),
    ('Xiang Yu', 'xiang-yu'),
    ('Yi Seong-Gye', 'yi-seong-gye'),
    ('Yi Sun-sin', 'yi-sun-sin'),
    ('Zenobia', 'zenobia'),
    ('Zhuge Liang', 'zhuge-liang'),
]

# commanders of our guides that are not pickable: golden keys, gathering, epic and elite (same research)
EXCLUDED = frozenset(
    {
        # golden keys
        'Cao Cao',
        'Charles Martel',
        'El Cid',
        # gathering (Casimir III, Pepin III, Seondeok and Yahya ibn Khalid are in the golden keys too)
        'Casimir III',
        'Constance',
        'Matilda of Flanders',
        'Pepin III',
        'Seondeok',
        'Yahya ibn Khalid',
        # epic – the versions in our guides (Joan of Arc and Pelagius from the golden keys, Lohar from his event)
        'Baibars',
        'Belisarius',
        'Bjorn Ironside',
        'Boudica',
        'Imhotep',
        'Joan of Arc',
        'Lohar',
        'Pelagius',
        'Sun Tzu',
    }
)


def portrait_name(name: str) -> str:
    """The portrait file of a commander: "Jan Žižka" → jan-zizka (slug of the name without diacritics)."""
    return slug(unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode())


def _icon(name: str) -> str:
    return f'/static/guides/commanders/{portrait_name(name)}.webp'


def march_commanders() -> list[dict]:
    """Sorted list of {name, icon, pick}: every commander a march may name. pick=False are the commanders of our guides
    in EXCLUDED – not offered any more, but a march saved with one keeps its portrait."""
    guides = {item['name']: item['icon'] for item in commander_index()}
    items = {name: {'name': name, 'icon': _icon(name), 'pick': True} for name, _ in ROSTER}
    for name, icon in guides.items():
        items.setdefault(name, {'name': name, 'icon': icon, 'pick': name not in EXCLUDED})
    return sorted(items.values(), key=lambda item: item['name'].casefold())


def missing_portraits() -> list[str]:
    return [name for name, _ in ROSTER if not (COMMANDER_DIR / f'{portrait_name(name)}.webp').exists()]

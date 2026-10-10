"""Turns the guide data of the meta modules into the HTML stored in Guide.html_sk / html_cs.

Blocks: ('p', text) · ('h2', text) · ('ul', [text, …]) · ('note',) · ('pairs', columns, rows)
· ('lineups', [(label, [(primary, secondary), …]), …]) · ('table', columns, rows) · ('sources', [(label, url), …])
– a source with url '' (e.g. confirmed in game by Gether) is plain text.
A text is t(sk, cs) or a plain string.
"""

import re
from pathlib import Path

# Icons (game art used with Gether's consent): one 96×96 webp per item or commander in guides/static/guides/<kind>/,
# named slug(name). Items come from codexhelper.com, commander portraits from rokstats.online. Every item named in an
# 'item', 'alt' or 'accessory' cell and every commander in a pair table gets its icon automatically.
ICON_ROOT = Path(__file__).resolve().parent.parent / 'static' / 'guides'
GEAR_DIR = ICON_ROOT / 'gear'
COMMANDER_DIR = ICON_ROOT / 'commanders'
# commander specialty tags of the game (Infantry, Garrison, …) – shown next to a guide in the guide list
SPECIALTY_DIR = ICON_ROOT / 'specialties'


def _known(folder):
    # longest first, so 'pendant-of-eternal-night' wins over 'eternal-night' and 'sun-tzu-prime' over 'sun-tzu'
    return sorted((path.stem for path in folder.glob('*.webp')), key=len, reverse=True)


ICONS = {'gear': _known(GEAR_DIR), 'commanders': _known(COMMANDER_DIR)}


def specialty_icon(specialty: str) -> str | None:
    """/static/guides/specialties/<specialty>.webp, or None without a specialty (or when the file is missing)."""
    if specialty and (SPECIALTY_DIR / f'{specialty}.webp').exists():
        return f'/static/guides/specialties/{specialty}.webp'
    return None


def t(sk, cs):
    return {'sk': sk, 'cs': cs}


def text(value, lang):
    return value[lang] if isinstance(value, dict) else value


LABELS = {
    'sk': {
        'primary': 'Primárny', 'secondary': 'Sekundárny', 'pair': 'Primárny + sekundárny', 'troops': 'Jednotky',
        'why': 'Prečo to funguje', 'talents': 'Talenty',
        'slot': 'Slot', 'item': 'Predmet', 'stats': 'Hlavné staty', 'alt': 'Alternatíva', 'gear': 'Výbava',
        'tier': 'Tier', 'accessory': 'Doplnok', 'effect': 'Efekt', 'what': 'Čo', 'detail': 'Detail',
        'stage': 'Fáza', 'points': 'Body', 'rank': 'Umiestnenie', 'reward': 'Odmena', 'cadence': 'Ako často',
        'events': 'Eventy', 'objective': 'Cieľ', 'kind': 'Typ', 'lineup': 'Armády', 'kvk1': 'KvK1', 'kvk2': 'KvK2',
        'sources': 'Zdroje', 'state': 'Stav k',
    },
    'cs': {
        'primary': 'Primární', 'secondary': 'Sekundární', 'pair': 'Primární + sekundární', 'troops': 'Jednotky',
        'why': 'Proč to funguje', 'talents': 'Talenty',
        'slot': 'Slot', 'item': 'Předmět', 'stats': 'Hlavní staty', 'alt': 'Alternativa', 'gear': 'Výbava',
        'tier': 'Tier', 'accessory': 'Doplněk', 'effect': 'Efekt', 'what': 'Co', 'detail': 'Detail',
        'stage': 'Fáze', 'points': 'Body', 'rank': 'Umístění', 'reward': 'Odměna', 'cadence': 'Jak často',
        'events': 'Eventy', 'objective': 'Cíl', 'kind': 'Typ', 'lineup': 'Armády', 'kvk1': 'KvK1', 'kvk2': 'KvK2',
        'sources': 'Zdroje', 'state': 'Stav k',
    },
}  # fmt: skip

# "Stav k októbru 2026" – month in the dative
MONTHS = {
    'sk': ['januáru', 'februáru', 'marcu', 'aprílu', 'máju', 'júnu', 'júlu', 'augustu', 'septembru', 'októbru',
           'novembru', 'decembru'],
    'cs': ['lednu', 'únoru', 'březnu', 'dubnu', 'květnu', 'červnu', 'červenci', 'srpnu', 'září', 'říjnu',
           'listopadu', 'prosinci'],
}  # fmt: skip

SLOTS = {
    'helmet': t('Prilba', 'Helma'),
    'weapon': t('Zbraň', 'Zbraň'),
    'chest': t('Hruď', 'Hruď'),
    'gloves': t('Rukavice', 'Rukavice'),
    'legs': t('Nohavice', 'Kalhoty'),
    'boots': t('Topánky', 'Boty'),
    'accessories': t('Doplnky', 'Doplňky'),
}

STAT = {'atk': t('útok', 'útok'), 'def': t('obrana', 'obrana'), 'hp': t('zdravie', 'zdraví')}
TROOP = {
    'cav': t('jazdy', 'jízdy'),
    'inf': t('pechoty', 'pěchoty'),
    'arch': t('lukostrelcov', 'lučištníků'),
    'all': t('jednotiek', 'jednotek'),
}


def st(*parts):
    """st(('atk', 'cav', 25), ('def', 'arch', 5)) → 'útok jazdy 25 %, obrana lukostrelcov 5 %'"""

    def one(lang, stat, troop, value):
        number = f'{value}'.replace('.', ',')
        return f'{STAT[stat][lang]} {TROOP[troop][lang]} {number} %'

    return {lang: ', '.join(one(lang, *part) for part in parts) for lang in ('sk', 'cs')}


def slug(value):
    """"Navar's Control (KvK)" → 'navars-control-kvk'"""
    value = re.sub("['’]", '', value.lower())
    return re.sub('[^a-z0-9]+', '-', value).strip('-')


def find_icons(value, kind):
    """Icons of the items or commanders named in a table cell, in the order they are mentioned (names are English in
    both languages)."""
    haystack = f'-{slug(text(value, "sk"))}-'
    found = []
    for icon in ICONS[kind]:
        at = haystack.find(f'-{icon}-')
        if at >= 0:
            found.append((at, icon))
            # blank the match out so a shorter name inside it cannot match again
            haystack = haystack[: at + 1] + '#' * len(icon) + haystack[at + 1 + len(icon) :]
    return [icon for _, icon in sorted(found)]


def gear_icons(value):
    return find_icons(value, 'gear')


def commander_icons(value):
    return find_icons(value, 'commanders')


def _icon(kind, name, small=False):
    size, extra = (20, ' pic__icon--small') if small else (44, '')
    src = f'/static/guides/{kind}/{name}.webp'
    return f'<img class="pic__icon{extra}" src="{src}" alt="" width="{size}" height="{size}" loading="lazy">'


def _portrait(name):
    """A commander's portrait standing for the name itself (alt and tooltip carry the name)."""
    src = f'/static/guides/commanders/{slug(name)}.webp'
    return f'<img class="pic__icon" src="{src}" alt="{name}" title="{name}" width="44" height="44" loading="lazy">'


def _lineups(rows, lang):
    """Army line-ups as portraits only (Gether, 10. 10. 2026): a label, then one group per army – a pair or a single
    commander. The names are in the pair tables above, here the faces are enough."""
    items = ''
    for label, armies in rows:
        groups = ''.join(
            f'<span class="army" title="{" + ".join(army)}">{"".join(_portrait(name) for name in army)}</span>'
            for army in armies
        )
        items += f'<li><strong>{text(label, lang)}</strong><span class="lineups__armies">{groups}</span></li>'
    return f'<ul class="lineups">{items}</ul>'


def _with_icons(kind, icons, html):
    """Icons in front of the name(s); on phones they sit above it (styles.scss → .prose .pic)."""
    if not icons:
        return html
    images = ''.join(_icon(kind, name) for name in icons)
    return f'<span class="pic"><span class="pic__icons">{images}</span><span>{html}</span></span>'


def verified_note(verified, note):
    """('2026-10', t('Meta sa mení…', …)) → t('Stav k októbru 2026. Meta sa mení…', …); None = the note alone
    (tips and tricks have no dates, Gether 10. 10. 2026)"""
    if verified is None:
        return note
    year, month = (int(part) for part in verified.split('-'))
    return {lang: f'{LABELS[lang]["state"]} {MONTHS[lang][month - 1]} {year}. {note[lang]}' for lang in ('sk', 'cs')}


def _pairs(columns, rows, lang):
    labels = LABELS[lang]
    if 'why' not in columns:
        # short overview: one value per column
        head = ''.join(f'<th scope="col">{labels[c]}</th>' for c in columns)
        body = ''
        for row in rows:
            cells = ''
            for c in columns:
                value = f'<strong>{text(row[c], lang)}</strong>' if c == 'primary' else text(row[c], lang)
                if c in ('primary', 'secondary'):
                    value = _with_icons('commanders', commander_icons(row[c]), value)
                cells += f'<td>{value}</td>'
            body += f'<tr>{cells}</tr>'
        return f'<table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>'

    # pair, troops and talents are folded into two cells so the table stays readable on phones
    head = f'<th scope="col">{labels["pair"]}</th><th scope="col">{labels["why"]}</th>'
    body = ''
    for row in rows:
        pair = f'<strong>{row["primary"]}</strong> + {text(row["secondary"], lang)}'
        if 'troops' in columns:
            pair += f'<br><small>{text(row["troops"], lang)}</small>'
        primary = commander_icons(row['primary'])
        pair = _with_icons('commanders', primary + [i for i in commander_icons(row['secondary']) if i not in primary], pair)
        why = text(row['why'], lang)
        if 'talents' in columns and row.get('talents'):
            why += f'<br><small>{labels["talents"]}: {row["talents"]}</small>'
        cells = f'<td>{pair}</td><td>{why}</td>'
        body += f'<tr>{cells}</tr>'
    return f'<table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>'


def _table(columns, rows, lang):
    labels = LABELS[lang]
    # the alternative is folded under the item, so the table stays readable on phones
    columns = [c for c in columns if c != 'alt']
    head = ''.join(f'<th scope="col">{labels[c]}</th>' for c in columns)
    body = ''
    for row in rows:
        cells = ''
        for c in columns:
            value = row.get(c, '')
            value = SLOTS[value][lang] if c == 'slot' else text(value, lang)
            if c in ('item', 'what', 'tier', 'stage', 'rank', 'cadence', 'objective', 'kind'):
                value = f'<strong>{value}</strong>'
            if c == 'item' and row.get('alt'):
                # small icons only for alternatives that are not the item itself
                extra = ''.join(
                    _icon('gear', i, small=True) for i in gear_icons(row['alt']) if i not in gear_icons(row['item'])
                )
                value += f'<br><small>{labels["alt"]}: {extra}{text(row["alt"], lang)}</small>'
            if c in ('item', 'accessory'):
                value = _with_icons('gear', gear_icons(row[c]), value)
            cells += f'<td>{value}</td>'
        body += f'<tr>{cells}</tr>'
    return f'<table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>'


def render(blocks, lang, note):
    html = []
    for block in blocks:
        kind = block[0]
        if kind == 'p':
            html.append(f'<p>{text(block[1], lang)}</p>')
        elif kind == 'note':
            html.append(f'<blockquote>{note[lang]}</blockquote>')
        elif kind == 'h2':
            html.append(f'<h2>{text(block[1], lang)}</h2>')
        elif kind == 'ul':
            html.append('<ul>' + ''.join(f'<li>{text(item, lang)}</li>' for item in block[1]) + '</ul>')
        elif kind == 'pairs':
            html.append(_pairs(block[1], block[2], lang))
        elif kind == 'lineups':
            html.append(_lineups(block[1], lang))
        elif kind == 'table':
            html.append(_table(block[1], block[2], lang))
        elif kind == 'sources':
            html.append(f'<h2>{LABELS[lang]["sources"]}</h2>')
            links = ''.join(
                f'<li><a href="{url}" target="_blank" rel="noopener noreferrer">{text(label, lang)}</a></li>'
                if url
                else f'<li>{text(label, lang)}</li>'
                for label, url in block[1]
            )
            html.append(f'<ul>{links}</ul>')
        else:
            raise ValueError(f'unknown block {kind!r}')
    # typographic apostrophes in names (Navar’s Control); attributes use double quotes
    return '\n'.join(html).replace("'", '’')

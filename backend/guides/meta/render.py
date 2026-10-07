"""Turns the guide data of the meta modules into the HTML stored in Guide.html_sk / html_cs.

Blocks: ('p', text) · ('h2', text) · ('ul', [text, …]) · ('note',) · ('pairs', columns, rows)
· ('table', columns, rows) · ('sources', [(label, url), …]). A text is t(sk, cs) or a plain string.
"""


def t(sk, cs):
    return {'sk': sk, 'cs': cs}


def text(value, lang):
    return value[lang] if isinstance(value, dict) else value


LABELS = {
    'sk': {
        'primary': 'Primárny', 'secondary': 'Sekundárny', 'pair': 'Primárny + sekundárny', 'troops': 'Jednotky',
        'why': 'Prečo to funguje', 'talents': 'Talenty', 'f2p': 'F2P', 'yes': 'áno', 'partly': 'čiastočne', 'no': 'nie',
        'slot': 'Slot', 'item': 'Predmet', 'stats': 'Hlavné staty', 'alt': 'Alternatíva', 'gear': 'Výbava',
        'tier': 'Tier', 'accessory': 'Doplnok', 'effect': 'Efekt', 'what': 'Čo', 'detail': 'Detail',
        'stage': 'Fáza', 'points': 'Body', 'rank': 'Umiestnenie', 'reward': 'Odmena', 'cadence': 'Ako často',
        'events': 'Eventy', 'objective': 'Cieľ', 'kind': 'Typ', 'lineup': 'Armády', 'kvk1': 'KvK1', 'kvk2': 'KvK2',
        'sources': 'Zdroje', 'state': 'Stav k',
    },
    'cs': {
        'primary': 'Primární', 'secondary': 'Sekundární', 'pair': 'Primární + sekundární', 'troops': 'Jednotky',
        'why': 'Proč to funguje', 'talents': 'Talenty', 'f2p': 'F2P', 'yes': 'ano', 'partly': 'částečně', 'no': 'ne',
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


def verified_note(verified, note):
    """('2026-10', t('Meta sa mení…', …)) → t('Stav k októbru 2026. Meta sa mení…', …)"""
    year, month = (int(part) for part in verified.split('-'))
    return {lang: f'{LABELS[lang]["state"]} {MONTHS[lang][month - 1]} {year}. {note[lang]}' for lang in ('sk', 'cs')}


def _pairs(columns, rows, lang):
    labels = LABELS[lang]
    if 'why' not in columns:
        # short overview: one value per column
        head = ''.join(f'<th scope="col">{labels[c]}</th>' for c in columns)
        body = ''
        for row in rows:
            cells = ''.join(
                f'<td><strong>{text(row[c], lang)}</strong></td>' if c == 'primary' else f'<td>{text(row[c], lang)}</td>'
                for c in columns
            )
            body += f'<tr>{cells}</tr>'
        return f'<table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>'

    # pair, troops and talents are folded into two cells so the table stays readable on phones
    head = f'<th scope="col">{labels["pair"]}</th><th scope="col">{labels["why"]}</th>'
    if 'f2p' in columns:
        head += f'<th scope="col">{labels["f2p"]}</th>'
    body = ''
    for row in rows:
        pair = f'<strong>{row["primary"]}</strong> + {text(row["secondary"], lang)}'
        if 'troops' in columns:
            pair += f'<br><small>{text(row["troops"], lang)}</small>'
        why = text(row['why'], lang)
        if 'talents' in columns:
            why += f'<br><small>{labels["talents"]}: {row["talents"]}</small>'
        cells = f'<td>{pair}</td><td>{why}</td>'
        if 'f2p' in columns:
            cells += f'<td>{labels[row["f2p"]]}</td>'
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
                value += f'<br><small>{labels["alt"]}: {text(row["alt"], lang)}</small>'
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
        elif kind == 'table':
            html.append(_table(block[1], block[2], lang))
        elif kind == 'sources':
            html.append(f'<h2>{LABELS[lang]["sources"]}</h2>')
            links = ''.join(
                f'<li><a href="{url}" target="_blank" rel="noopener noreferrer">{label}</a></li>' for label, url in block[1]
            )
            html.append(f'<ul>{links}</ul>')
        else:
            raise ValueError(f'unknown block {kind!r}')
    # typographic apostrophes in names (Navar’s Control); attributes use double quotes
    return '\n'.join(html).replace("'", '’')

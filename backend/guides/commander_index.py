"""Commander finder on /navody ("mám Attilu, s kým?"): every recommended pair of the commander guides, by commander.

Built from the data of guides/meta/commanders.py – the pair tables and the army line-ups – so it always says what the
guides say. Only guides published with auto_update=True count: a guide hidden or rewritten by hand in the admin drops
out, and guides written by hand are never indexed (the block says "podľa našich návodov", not "all pairs").
"""

import re

from . import meta
from .meta import commanders
from .meta.render import find_icons, slug, text
from .models import Guide

# (meta.LAST_UPDATE, published slugs) → index; rebuilt only when one of them changes
_cache: dict = {}


def _icon(name: str) -> str:
    return f'/static/guides/commanders/{name}.webp'


def _names(cell) -> list[dict]:
    """Commanders named in a pair cell ("Attila / Gang Gamchan" → two), each with its name as written in the guide.
    t('ktokoľvek', …) names nobody: an empty list."""
    if not isinstance(cell, str):
        return []
    words = [word for word in re.split(r'[\s/+,]+', cell) if word]
    found = []
    for icon in find_icons(cell, 'commanders'):
        # the shortest run of words whose slug is the icon's ("Sun Tzu Prime" → sun-tzu-prime)
        spans = (' '.join(words[i:j]) for i in range(len(words)) for j in range(i + 1, len(words) + 1))
        name = next((span for span in spans if slug(span) == icon), icon.replace('-', ' ').title())
        found.append({'name': name, 'icon': _icon(icon)})
    return found


def _pairs(guide):
    """(primary cell, secondary cell or None, context) of every pair of a guide – pair tables, then line-ups.
    The context is the 'troops' column ("Jazda – pole") or the line-up label ("Dve armády")."""
    for block in guide['blocks']:
        if block[0] == 'pairs':
            columns, rows = block[1], block[2]
            for row in rows:
                # the monthly meta update may change the columns; a pair without both commanders is a data error
                missing = [column for column in ('primary', 'secondary') if not row.get(column)]
                if missing:
                    raise ValueError(f'{guide["slug"]}: pair row without {" and ".join(missing)}: {row}')
                yield row['primary'], row['secondary'], row.get('troops') if 'troops' in columns else None
        elif block[0] == 'lineups':
            for label, armies in block[1]:
                for army in armies:
                    # a 1-tuple is a single commander to focus on (F2P "Na koho sa sústrediť podľa fázy KvK")
                    yield army[0], (army[1] if len(army) > 1 else None), label


def build_index(guides=commanders.GUIDES, published=None) -> list[dict]:
    """Sorted list of {name, icon, entries}; an entry is one pair of one guide from this commander's side:
    role 'primary', 'secondary' or 'solo', the partners (alternatives, empty = anyone or none), the context and the
    guide. `published` limits it to these slugs (None = every guide of the data)."""
    by_icon: dict[str, dict] = {}
    seen = set()
    for guide in guides:
        if published is not None and guide['slug'] not in published:
            continue
        for primary_cell, secondary_cell, context in _pairs(guide):
            primaries = _names(primary_cell)
            if secondary_cell is None:
                sides = [(c, 'solo', []) for c in primaries]
            else:
                secondaries = _names(secondary_cell)
                sides = [(c, 'primary', secondaries) for c in primaries]
                sides += [(c, 'secondary', primaries) for c in secondaries]
            for commander, role, partners in sides:
                key = (commander['icon'], guide['slug'], role, tuple(p['icon'] for p in partners))
                if key in seen:  # the same pair again in a line-up: the first (pair table) keeps its context
                    continue
                seen.add(key)
                item = by_icon.setdefault(commander['icon'], {**commander, 'entries': []})
                item['entries'].append(
                    {
                        'slug': guide['slug'],
                        'category': commanders.CATEGORY,
                        'title_sk': guide['title']['sk'],
                        'title_cs': guide['title']['cs'],
                        'role': role,
                        'partners': partners,
                        'context_sk': text(context, 'sk') if context else '',
                        'context_cs': text(context, 'cs') if context else '',
                    }
                )
    return sorted(by_icon.values(), key=lambda item: item['name'].casefold())


def commander_index() -> list[dict]:
    """The index of the published auto-updated commander guides, cached in the process (one query per call)."""
    slugs = frozenset(
        Guide.objects.filter(is_published=True, auto_update=True, category=commanders.CATEGORY).values_list(
            'slug', flat=True
        )
    )
    key = (meta.LAST_UPDATE, slugs)
    if key not in _cache:
        _cache.clear()
        _cache[key] = build_index(published=slugs)
    return _cache[key]

"""The commander pair table of the KvK evaluation (CommanderPair, Gether 13. 10. 2026: in the database, editable without
a deploy): read for /vyhodnocovanie, saved from its Premenné tab, merged from lines pasted from a spreadsheet in the
admin (Slim: "upravíš excel a prepočíta sa to"). The names are always written like the roster (commander_names)."""

import hashlib
import json
import re

from django.db import transaction

from .models import PAIR_POINTS_MAX, CommanderPair, fold
from .roster import commander_names

# far more than the meta has pairs – a sane limit for one request
MAX_PAIRS = 2000


def number(points) -> int | float:
    value = float(points)
    return int(value) if value.is_integer() else value


def pair_rows() -> list[list]:
    """[primary, secondary, points] of every pair, the best first (as the page keeps its table)."""
    return [[p.primary, p.secondary, number(p.points)] for p in CommanderPair.objects.all()]


def pairs_version(rows: list[list]) -> str:
    """What the page saw of the table: a save made against another version would undo a change made meanwhile (the
    admin, another evaluator), so it is refused."""
    return hashlib.sha1(json.dumps(rows, ensure_ascii=False).encode()).hexdigest()[:16]


def sort_rows(rows: list[list]) -> list[list]:
    return sorted(rows, key=lambda row: (-row[2], row[0].casefold(), row[1].casefold()))


def check_rows(value) -> tuple[list[list], list[str]]:
    """The rows the page sends ([primary, secondary, points]) → the rows written like the roster and the unknown
    names. Raises ValueError for anything that is not such a row. Left out: rows without a name (an empty row added and
    not filled in), the same commander twice, and a pair written twice after its first row (the page adds new rows on
    top)."""
    if not isinstance(value, list) or len(value) > MAX_PAIRS:
        raise ValueError('pairs')
    known = commander_names()
    rows, unknown, seen = [], [], set()
    for row in value:
        if not (isinstance(row, list) and len(row) == 3):
            raise ValueError('row')
        primary, secondary, points = row
        if not (isinstance(primary, str) and isinstance(secondary, str)):
            raise ValueError('name')
        if isinstance(points, bool) or not isinstance(points, (int, float)) or not 0 <= points <= PAIR_POINTS_MAX:
            raise ValueError('points')
        primary, secondary = primary.strip(), secondary.strip()
        key = (fold(primary), fold(secondary))
        if not primary or not secondary or key[0] == key[1] or key in seen:
            continue
        seen.add(key)
        unknown += [name for name in (primary, secondary) if fold(name) not in known]
        rows.append([known.get(key[0], primary), known.get(key[1], secondary), number(round(points, 1))])
    return sort_rows(rows), sorted(set(unknown), key=str.casefold)


@transaction.atomic
def replace_pairs(rows: list[list]) -> None:
    """The whole table as the page has it – only what changed is written: rows not there any more go away, changed
    points are saved, new pairs added (the rest keeps its "upravené")."""
    wanted = {(p, s): n for p, s, n in rows}
    for pair in CommanderPair.objects.all():
        points = wanted.pop((pair.primary, pair.secondary), None)
        if points is None:
            pair.delete()
        elif float(pair.points) != float(points):
            pair.points = points
            pair.save(update_fields=['points', 'updated_at'])
    CommanderPair.objects.bulk_create(CommanderPair(primary=p, secondary=s, points=n) for (p, s), n in wanted.items())


@transaction.atomic
def merge_pairs(rows: list[list]) -> tuple[int, int]:
    """Pasted rows into the table: a new pair is added, an existing one gets the new points, the rest stays.
    Returns (added, changed)."""
    existing = {(fold(p.primary), fold(p.secondary)): p for p in CommanderPair.objects.all()}
    added = changed = 0
    for primary, secondary, points in rows:
        pair = existing.get((fold(primary), fold(secondary)))
        if pair is None:
            CommanderPair.objects.create(primary=primary, secondary=secondary, points=points)
            added += 1
        elif float(pair.points) != float(points):
            pair.points = points
            pair.save(update_fields=['points', 'updated_at'])
            changed += 1
    return added, changed


def known_name(name: str, known: dict[str, str] | None = None) -> str | None:
    """The commander's name as the roster writes it, None for a name a march cannot have."""
    return (known if known is not None else commander_names()).get(fold(name))


def parse_lines(text: str) -> tuple[list[list], list[str]]:
    """Lines "primary; secondary; points" (a tab from a spreadsheet works too, a decimal comma as well) → the rows and
    the errors by line. A commander must be one a march can name, the two must differ."""
    known = commander_names()
    rows, errors = [], []
    for line_number, line in enumerate(text.splitlines(), 1):
        if not line.strip():
            continue
        parts = [part.strip() for part in re.split(r'[\t;]', line) if part.strip()]
        if len(parts) != 3:
            errors.append(f'{line_number}. riadok: treba primárny; sekundárny; body')
            continue
        primary, secondary, points = parts
        try:
            value = float(points.replace(',', '.').replace(' ', ''))
        except ValueError:
            errors.append(f'{line_number}. riadok: body „{points}“ nie sú číslo')
            continue
        if not 0 <= value <= PAIR_POINTS_MAX:
            errors.append(f'{line_number}. riadok: body musia byť 0 – {PAIR_POINTS_MAX}')
            continue
        bad = [name for name in (primary, secondary) if fold(name) not in known]
        if bad:
            errors.append(f'{line_number}. riadok: neznámy commander {", ".join(f"„{name}“" for name in bad)}')
            continue
        if fold(primary) == fold(secondary):
            errors.append(f'{line_number}. riadok: primárny a sekundárny musia byť dvaja rôzni commanderi')
            continue
        rows.append([known[fold(primary)], known[fold(secondary)], number(round(value, 1))])
    return rows, errors

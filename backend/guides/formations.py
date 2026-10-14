"""The formation each commander should lead with (CommanderFormation, Gether 14. 10. 2026) – read for /vyhodnocovanie,
saved from its Premenné tab and in the admin. Names written like the roster, formations as the ids of armory.json."""

from django.db import transaction

from .armory import formations as formation_ids
from .models import CommanderFormation, fold
from .roster import commander_names

# more than the game has commanders – a sane limit for one request
MAX_COMMANDERS = 500
# a commander with more good formations than this takes any
MAX_PER_COMMANDER = 3


def formation_map() -> dict[str, list[str]]:
    """commander → the formation ids in order, only those with a formation"""
    return {row.commander: row.formations for row in CommanderFormation.objects.all() if row.formations}


def clean_formations(value) -> list[str]:
    """A list of known formation ids, each once, at most MAX_PER_COMMANDER; ValueError for anything else."""
    known = formation_ids()
    if not isinstance(value, list) or len(value) > MAX_PER_COMMANDER:
        raise ValueError('formations')
    if any(not isinstance(f, str) or f not in known for f in value):
        raise ValueError('formation')
    return list(dict.fromkeys(value))


def check_formations(value) -> tuple[dict[str, list[str]], list[str]]:
    """{commander: [formation, …]} as the page sends it → written like the roster, and the unknown names. Raises
    ValueError for anything that is not such a map. An empty list = the commander takes any formation."""
    if not isinstance(value, dict) or len(value) > MAX_COMMANDERS:
        raise ValueError('formations')
    known = commander_names()
    mapping, unknown = {}, []
    for name, chosen in value.items():
        if not isinstance(name, str) or not name.strip():
            raise ValueError('name')
        chosen = clean_formations(chosen)
        key = fold(name)
        if key not in known:
            unknown.append(name.strip())
            continue
        mapping[known[key]] = chosen
    return mapping, sorted(set(unknown), key=str.casefold)


@transaction.atomic
def replace_formations(mapping: dict[str, list[str]]) -> None:
    """The whole table as the page has it; a commander left out or with no formation goes away, only changes are
    written."""
    wanted = {name: chosen for name, chosen in mapping.items() if chosen}
    for row in CommanderFormation.objects.all():
        chosen = wanted.pop(row.commander, None)
        if chosen is None:
            row.delete()
        elif row.formations != chosen:
            row.formations = chosen
            row.save(update_fields=['formations', 'updated_at'])
    CommanderFormation.objects.bulk_create(CommanderFormation(commander=n, formations=f) for n, f in wanted.items())

"""Is a march's commander pair one the KvK evaluation scores, and its formation the one its primary commander should
lead with? Gether 14. 10. 2026: the player and the superadmin see a red border on such a march; the other players do
not. The same rules as frontend/src/app/pages/evaluation/scoring.ts: a march of a counted type without a secondary
commander, or with a pair (in this order) that is not in guides.CommanderPair or has 0 points there, is not evaluated
(pairPoints); a march in another formation than guides.CommanderFormation lists for its primary scores its armaments
lower (formationOf) – a commander without formations, or a march without one, takes any. Types the evaluation does
not count (garrison and rally by default) get no warning."""

import math
from collections.abc import Callable

from guides.models import CommanderFormation, CommanderPair, fold

from .models import MAX_MARCHES, EvaluationSettings, March

# DEFAULT_SETTINGS.marches.kinds in frontend/src/app/pages/evaluation/settings.ts – until Premenné save their own list
DEFAULT_KINDS = ('infantry', 'cavalry', 'archer', 'leadership', 'engineering')
# DEFAULT_SETTINGS.marches.max and .order
DEFAULT_COUNT = 5
ORDERS = ('position', 'best')


def evaluation_marches() -> dict:
    """`marches` of the saved Premenné – one read shared by counted_kinds() and counting(); empty when unset or broken"""
    data = EvaluationSettings.objects.filter(pk=1).values_list('data', flat=True).first()
    marches = data.get('marches') if isinstance(data, dict) else None
    return marches if isinstance(marches, dict) else {}


def counted_kinds(marches: dict | None = None) -> set[str]:
    kinds = (evaluation_marches() if marches is None else marches).get('kinds')
    # the JSON can be edited in the admin – anything but names is left out instead of failing every march list
    return {k for k in kinds if isinstance(k, str)} if isinstance(kinds, list) else set(DEFAULT_KINDS)


def counting(marches: dict | None = None) -> dict:
    """Which marches the evaluation counts, told to the player on /marche: the first `count` (or the best) of the
    `kinds` in the player's order – read as parseSettings in settings.ts does (a number is rounded into 1 …
    MAX_MARCHES, anything else is the default) so the sentence says what scoring.ts does."""
    marches = evaluation_marches() if marches is None else marches
    count, order = marches.get('max'), marches.get('order')
    if isinstance(count, (int, float)) and not isinstance(count, bool) and math.isfinite(count):
        count = min(MAX_MARCHES, max(1, math.floor(count + 0.5)))
    else:
        count = DEFAULT_COUNT
    kinds = counted_kinds(marches)
    return {
        'order': order if order in ORDERS else ORDERS[0],
        'count': count,
        # the march types in the order of the type picker
        'kinds': [kind for kind in March.Kind.values if kind in kinds],
    }


def march_checker(marches: dict | None = None) -> Callable[[March], dict]:
    """One read of the settings (or `marches` already read by evaluation_marches()), the pair table and the
    formations; the returned function says what is wrong with a march: pair_problem 'solo' (no secondary), 'unknown'
    (not in the table or 0 points) or None, pair_hint how to fix an 'unknown' pair ({swap: the other order scores},
    never the points; else None) and formation_problem the formations its primary should lead with when it uses
    another one (else None)."""
    kinds = counted_kinds(marches)
    table: dict[tuple[str, str], float] = {}
    for primary, secondary, points in CommanderPair.objects.values_list('primary', 'secondary', 'points'):
        table.setdefault((fold(primary), fold(secondary)), points)
    formations = {fold(row.commander): row.formations for row in CommanderFormation.objects.all() if row.formations}

    def scores(primary: str, secondary: str) -> bool:
        return (table.get((fold(primary), fold(secondary))) or 0) > 0

    def pair(march: March) -> str | None:
        if not march.secondary:
            return 'solo'
        return None if table.get((fold(march.primary), fold(march.secondary))) else 'unknown'

    def formation(march: March) -> list[str] | None:
        wanted = formations.get(fold(march.primary))
        return wanted if wanted and march.formation and march.formation not in wanted else None

    def check(march: March) -> dict:
        if march.kind not in kinds or not march.primary:
            return {'pair_problem': None, 'pair_hint': None, 'formation_problem': None}
        problem = pair(march)
        # the player cannot see the pair table – say when only the order is wrong (names as on the march)
        hint = {'swap': scores(march.secondary, march.primary)} if problem == 'unknown' else None
        return {'pair_problem': problem, 'pair_hint': hint, 'formation_problem': formation(march)}

    return check

"""Is a march's commander pair one the KvK evaluation scores, and its formation the one its primary commander should
lead with? Gether 14. 10. 2026: the player and the superadmin see a red border on such a march; the other players do
not. The same rules as frontend/src/app/pages/evaluation/scoring.ts: a march of a counted type without a secondary
commander, or with a pair (in this order) that is not in guides.CommanderPair or has 0 points there, is not evaluated
(pairPoints); a march in another formation than guides.CommanderFormation lists for its primary scores its armaments
lower (formationOf) – a commander without formations, or a march without one, takes any. Types the evaluation does
not count (garrison and rally by default) get no warning about the pair or the formation. An armament bonus over
its cap (ARMAMENT_CAPS, Gether 19. 10. 2026) is a typo whatever the type – red as well; the evaluation counts the
cap. So is a march of any type without the equipment or the armaments clicked together (Gether 30. 10. 2026:
"upozornenie aj keď nemá vyplnený equip alebo armamenty, tým istým spôsobom ako zlý commander pár")."""

import math
from collections.abc import Callable
from decimal import Decimal

from guides.models import CommanderFormation, CommanderPair, fold

from .models import MAX_MARCHES, EvaluationSettings, March

# DEFAULT_SETTINGS.marches.kinds in frontend/src/app/pages/evaluation/settings.ts – until Premenné save their own list
DEFAULT_KINDS = ('infantry', 'cavalry', 'archer', 'leadership', 'engineering')
# DEFAULT_SETTINGS.marches.max
DEFAULT_COUNT = 5
# the most an armament bonus can be (Gether 19. 10. 2026: "14 % atk, def, HP a 8 % all dmg") – ARMAMENT_CAPS in
# frontend/src/app/core/kvk-api.ts
ARMAMENT_CAPS = {'attack': Decimal(14), 'defense': Decimal(14), 'health': Decimal(14), 'damage': Decimal(8)}


def over_caps(army) -> list[str] | None:
    """The armament bonuses of a march or a sign-up over their cap, in the order of ARMAMENT_CAPS; None = none"""
    over = [stat for stat, cap in ARMAMENT_CAPS.items() if (getattr(army, stat) or 0) > cap]
    return over or None


def missing_parts(march: March) -> list[str] | None:
    """'gear' = not a single item clicked, 'armaments' = neither a formation nor an inscription, or no ATK/DEF/HP
    (emptyParts in frontend/src/app/core/armory.ts + REQUIRED_STATS); None = both filled in"""
    missing = []
    if not any(isinstance(piece, dict) and piece.get('item') for piece in (march.gear or {}).values()):
        missing.append('gear')
    no_build = not march.formation and not march.inscriptions
    if no_build or any(getattr(march, stat) is None for stat in ('attack', 'defense', 'health')):
        missing.append('armaments')
    return missing or None


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
    """Which marches the evaluation counts, told to the player on /marche: the best `count` of the `kinds` by score
    (Gether 16. 10. 2026) – read as parseSettings in settings.ts does (a number is rounded into 1 … MAX_MARCHES,
    anything else is the default) so the sentence says what scoring.ts does."""
    marches = evaluation_marches() if marches is None else marches
    count = marches.get('max')
    if isinstance(count, (int, float)) and not isinstance(count, bool) and math.isfinite(count):
        count = min(MAX_MARCHES, max(1, math.floor(count + 0.5)))
    else:
        count = DEFAULT_COUNT
    kinds = counted_kinds(marches)
    return {
        'count': count,
        # the march types in the order of the type picker
        'kinds': [kind for kind in March.Kind.values if kind in kinds],
    }


def march_checker(marches: dict | None = None) -> Callable[[March], dict]:
    """One read of the settings (or `marches` already read by evaluation_marches()), the pair table and the
    formations; the returned function says what is wrong with a march: pair_problem 'solo' (no secondary), 'unknown'
    (not in the table or 0 points) or None, pair_hint how to fix an 'unknown' pair ({swap: the other order scores},
    never the points; else None), formation_problem the formations its primary should lead with when it uses
    another one (else None), stats_problem the armament bonuses over their cap (over_caps – any type) and
    gear_problem what is not filled in (missing_parts – any type)."""
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
        stats = over_caps(march)
        gear = missing_parts(march)
        if march.kind not in kinds or not march.primary:
            return {
                'pair_problem': None,
                'pair_hint': None,
                'formation_problem': None,
                'stats_problem': stats,
                'gear_problem': gear,
            }
        problem = pair(march)
        # the player cannot see the pair table – say when only the order is wrong (names as on the march)
        hint = {'swap': scores(march.secondary, march.primary)} if problem == 'unknown' else None
        return {
            'pair_problem': problem,
            'pair_hint': hint,
            'formation_problem': formation(march),
            'stats_problem': stats,
            'gear_problem': gear,
        }

    return check

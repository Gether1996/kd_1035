"""Is a march's commander pair one the KvK evaluation scores? Gether 14. 10. 2026: the player and the superadmin see a
red border on a march whose pair is filled in wrong; the other players do not. The same rule as pairPoints in
frontend/src/app/pages/evaluation/scoring.ts: a march of a counted type without a secondary commander, or with a pair
(in this order) that is not in guides.CommanderPair or has 0 points there, is not evaluated. Types the evaluation does
not count (garrison and rally by default) get no warning."""

from collections.abc import Callable

from guides.models import CommanderPair, fold

from .models import EvaluationSettings, March

# DEFAULT_SETTINGS.marches.kinds in frontend/src/app/pages/evaluation/settings.ts – until Premenné save their own list
DEFAULT_KINDS = ('infantry', 'cavalry', 'archer', 'leadership', 'engineering')


def counted_kinds() -> set[str]:
    data = EvaluationSettings.objects.filter(pk=1).values_list('data', flat=True).first()
    marches = data.get('marches') if isinstance(data, dict) else None
    kinds = marches.get('kinds') if isinstance(marches, dict) else None
    return set(kinds) if isinstance(kinds, list) else set(DEFAULT_KINDS)


def pair_checker() -> Callable[[March], str | None]:
    """One read of the settings and the pair table; the returned function says what is wrong with a march's pair:
    'solo' (no secondary), 'unknown' (not in the table or 0 points) or None."""
    kinds = counted_kinds()
    table: dict[tuple[str, str], float] = {}
    for primary, secondary, points in CommanderPair.objects.values_list('primary', 'secondary', 'points'):
        table.setdefault((fold(primary), fold(secondary)), points)

    def problem(march: March) -> str | None:
        if march.kind not in kinds or not march.primary:
            return None
        if not march.secondary:
            return 'solo'
        return None if table.get((fold(march.primary), fold(march.secondary))) else 'unknown'

    return problem

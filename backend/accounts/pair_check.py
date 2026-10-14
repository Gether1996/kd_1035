"""Is a march's commander pair one the KvK evaluation scores, and its formation the one its primary commander should
lead with? Gether 14. 10. 2026: the player and the superadmin see a red border on such a march; the other players do
not. The same rules as frontend/src/app/pages/evaluation/scoring.ts: a march of a counted type without a secondary
commander, or with a pair (in this order) that is not in guides.CommanderPair or has 0 points there, is not evaluated
(pairPoints); a march in another formation than guides.CommanderFormation lists for its primary scores its armaments
lower (formationOf) – a commander without formations, or a march without one, takes any. Types the evaluation does
not count (garrison and rally by default) get no warning."""

from collections.abc import Callable

from guides.models import CommanderFormation, CommanderPair, fold

from .models import EvaluationSettings, March

# DEFAULT_SETTINGS.marches.kinds in frontend/src/app/pages/evaluation/settings.ts – until Premenné save their own list
DEFAULT_KINDS = ('infantry', 'cavalry', 'archer', 'leadership', 'engineering')


def counted_kinds() -> set[str]:
    data = EvaluationSettings.objects.filter(pk=1).values_list('data', flat=True).first()
    marches = data.get('marches') if isinstance(data, dict) else None
    kinds = marches.get('kinds') if isinstance(marches, dict) else None
    return set(kinds) if isinstance(kinds, list) else set(DEFAULT_KINDS)


def march_checker() -> Callable[[March], dict]:
    """One read of the settings, the pair table and the formations; the returned function says what is wrong with a
    march: pair_problem 'solo' (no secondary), 'unknown' (not in the table or 0 points) or None, and formation_problem
    the formations its primary should lead with when it uses another one (else None)."""
    kinds = counted_kinds()
    table: dict[tuple[str, str], float] = {}
    for primary, secondary, points in CommanderPair.objects.values_list('primary', 'secondary', 'points'):
        table.setdefault((fold(primary), fold(secondary)), points)
    formations = {fold(row.commander): row.formations for row in CommanderFormation.objects.all() if row.formations}

    def pair(march: March) -> str | None:
        if not march.secondary:
            return 'solo'
        return None if table.get((fold(march.primary), fold(march.secondary))) else 'unknown'

    def formation(march: March) -> list[str] | None:
        wanted = formations.get(fold(march.primary))
        return wanted if wanted and march.formation and march.formation not in wanted else None

    def check(march: March) -> dict:
        if march.kind not in kinds or not march.primary:
            return {'pair_problem': None, 'formation_problem': None}
        return {'pair_problem': pair(march), 'formation_problem': formation(march)}

    return check

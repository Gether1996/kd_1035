"""The history of the KvK evaluation (Gether 24. 10. 2026: "históriu zmien do premenných a do druhého tabu, aby som
videl, čo kto kedy zmení … či niečo zmenil kolega"): every save of the variables, the commander pairs and formations,
a player's power / T4 / power correction and every publication of the required acclaim is written down here by the
server – who, when, what was before and what after. Only the superadmin reads it on /vyhodnocovanie; the worker deletes
entries older than KEEP_DAYS (the privacy page says so)."""

from datetime import timedelta
from decimal import Decimal

from django.utils import timezone

from .models import EvaluationChange

KEEP_DAYS = 180
# a save that changes more (the first save over the defaults) keeps the first this many lines
MAX_LINES = 300
MISSING = None


def flatten(value, prefix='') -> dict:
    """{'acclaim.benchmark': 5600000, 'power.table.0.min': 63, …} – dicts and lists of the variables to dotted paths"""
    if isinstance(value, dict):
        items = value.items()
    elif isinstance(value, list) and value and all(isinstance(v, dict) for v in value):
        items = ((str(i), v) for i, v in enumerate(value))
    else:
        return {prefix: value} if prefix else {}
    out = {}
    for key, inner in items:
        out.update(flatten(inner, f'{prefix}.{key}' if prefix else str(key)))
    return out


def plain(value):
    """JSON for the stored line: Decimal as a number"""
    if isinstance(value, Decimal):
        return float(value)
    return value


def diff(old: dict, new: dict) -> list[list]:
    """[path, old, new] of what differs, in the order of the paths"""
    paths = sorted(set(old) | set(new))
    return [[p, plain(old.get(p, MISSING)), plain(new.get(p, MISSING))] for p in paths if old.get(p, MISSING) != new.get(p, MISSING)]


def write(user, kind: str, lines: list[list], player=None) -> EvaluationChange | None:
    if not lines:
        return None
    return EvaluationChange.objects.create(
        author=user if user and user.is_authenticated else None, kind=kind, player=player, changes=lines[:MAX_LINES],
        truncated=max(0, len(lines) - MAX_LINES),
    )


def settings_changed(user, old: dict, new: dict) -> None:
    write(user, EvaluationChange.Kind.SETTINGS, diff(flatten(old or {}), flatten(new or {})))


def pairs_changed(user, old: list[list], new: list[list]) -> None:
    """A pair "Attila + Achilles" added (– → 92), removed (92 → –) or with other points"""
    as_map = lambda rows: {f'{p} + {s}': n for p, s, n in rows}  # noqa: E731
    write(user, EvaluationChange.Kind.PAIRS, diff(as_map(old), as_map(new)))


def formations_changed(user, old: dict, new: dict) -> None:
    write(user, EvaluationChange.Kind.FORMATIONS, diff(old, new))


def record_changed(user, player, old: dict, new: dict) -> None:
    """power, t4, power_bonus of one player"""
    write(user, EvaluationChange.Kind.PLAYER, diff(old, new), player=player)


def published(user, old_count: int, new_count: int) -> None:
    write(user, EvaluationChange.Kind.PUBLISH, [['rows', old_count, new_count]])


def prune(now=None) -> int:
    now = now or timezone.now()
    return EvaluationChange.objects.filter(created_at__lt=now - timedelta(days=KEEP_DAYS)).delete()[0]

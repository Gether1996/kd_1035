"""Draft kingdom events with the usual Rise of Kingdoms rotation (Gether, 8. 10. 2026: "a first template, I adjust it").

Cycles and the next starts come from the rotation published on rokcentral.com/calendar (projected to October 2026),
More Than Gems runs about once a month (confirmed in game by Gether). They are estimates: every draft is created
inactive and Gether checks the dates in the admin before switching it on. Game events start at 00:00 UTC.
"""

from datetime import UTC, datetime

from .models import KingdomEvent

DAY = 24 * 60


def utc(year, month, day):
    return datetime(year, month, day, tzinfo=UTC)


# name SK, name CZ, first start (00:00 UTC), repeat every N days, duration in days, guide slug
TEMPLATES = [
    ('MGE – Leadership', 'MGE – Leadership', utc(2026, 11, 16), 56, 6, 'mightiest-governor-mge'),
    ('MGE – Jazda', 'MGE – Jízda', utc(2026, 10, 5), 56, 6, 'mightiest-governor-mge'),
    ('MGE – Pechota', 'MGE – Pěchota', utc(2026, 10, 19), 56, 6, 'mightiest-governor-mge'),
    ('MGE – Lukostrelci', 'MGE – Lučištníci', utc(2026, 11, 2), 56, 6, 'mightiest-governor-mge'),
    ('Ark of Osiris', 'Ark of Osiris', utc(2026, 10, 14), 14, 5, 'ark-of-osiris'),
    ('Wheel of Fortune', 'Wheel of Fortune', utc(2026, 10, 6), 14, 3, 'wheel-of-fortune'),
    ('Esmeralda', 'Esmeralda', utc(2026, 10, 19), 14, 2, ''),
    ('Hunt for History (vajce)', 'Hunt for History (vejce)', utc(2026, 10, 16), 14, 2, ''),
    ('More Than Gems', 'More Than Gems', utc(2026, 10, 10), 28, 2, 'more-than-gems'),
    # every second Friday 00:00 UTC for 48 h, confirmed by Gether (8. 10. 2026)
    ('20 GH', '20 GH', utc(2026, 10, 16), 14, 2, ''),
    # no published date: placeholder start, Gether sets the real one
    ('Alliance Mobilization', 'Alliance Mobilization', utc(2026, 10, 12), 28, 7, 'alliance-mobilization'),
]

MESSAGE = '**{name}** začína {start} ({relative}).'

# Irregular events without a fixed cycle, usually in the evening (named by Gether). Active right away without a date:
# players see "ďalší termín oznámime" and pick their reminders in advance; Gether sets the start in the admin before
# each one. Placeholder start in the past = nothing planned yet.
IRREGULAR_TEMPLATES = [
    ('Silk Road', 'Silk Road'),
    ('Shadow Legion', 'Shadow Legion'),
]
NOT_PLANNED = datetime(2026, 10, 1, 18, tzinfo=UTC)  # 20:00 in Bratislava – the usual evening hour


def create_templates() -> list[str]:
    """Creates the drafts that do not exist yet (matched by the Slovak name). Returns the names it created."""
    from guides.models import Guide

    guides = {g.slug: g for g in Guide.objects.filter(category='eventy', is_published=True)}
    created = []
    for name_sk, name_cs, start, repeat_days, days, guide in TEMPLATES:
        if KingdomEvent.objects.filter(name_sk=name_sk).exists():
            continue
        KingdomEvent.objects.create(
            name_sk=name_sk,
            name_cs=name_cs if name_cs != name_sk else '',
            message=MESSAGE,
            starts_at=start,
            duration_minutes=days * DAY,
            repeat_days=repeat_days,
            time_basis=KingdomEvent.TimeBasis.UTC,
            # the day before (00:00 UTC is 1–2 am in Bratislava, an hour before would ping at night)
            reminders=[DAY],
            player_reminders=[60, DAY],
            guide=guides.get(guide),
            is_active=False,
        )
        created.append(name_sk)
    for name_sk, name_cs in IRREGULAR_TEMPLATES:
        if KingdomEvent.objects.filter(name_sk=name_sk).exists():
            continue
        KingdomEvent.objects.create(
            name_sk=name_sk,
            name_cs=name_cs if name_cs != name_sk else '',
            message=MESSAGE,
            starts_at=NOT_PLANNED,
            duration_minutes=60,
            irregular=True,
            time_basis=KingdomEvent.TimeBasis.LOCAL,
            reminders=[60, 15],
            player_reminders=[15, 60],
            is_active=True,
        )
        created.append(name_sk)
    return created

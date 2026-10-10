"""Draft kingdom events with the usual Rise of Kingdoms rotation (Gether, 8. 10. 2026: "a first template, I adjust it").

Cycles and the next starts come from the rotation published on rokcentral.com/calendar (projected to October 2026),
More Than Gems runs about once a month (confirmed in game by Gether). They are estimates: every draft is created
inactive and Gether checks the dates in the admin before switching it on. Game events start at 00:00 UTC.
"""

import json
from datetime import UTC, date, datetime
from pathlib import Path

from .models import EVENING_BEFORE, KingdomEvent

# The kingdom's events as Gether set them up in the dev database (8. 10. 2026: the rotation above switched on,
# Esmeralda removed – also from the drafts below, Hunt for History and Holy Knight's Treasure taking turns). A brand-new production database starts with them once (entrypoint.sh), later they are
# managed only in the production admin / calendar.
INITIAL_EVENTS = Path(__file__).with_name('initial_events.json')

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
    # hammer (Hunt for History) and egg (Holy Knight's Treasure) take turns every two weeks, each one every four
    # weeks (Gether, 8. 10. 2026); the egg cycles through three equipment sets, so each set comes every 12 weeks
    # (Gether, 9. 10. 2026: the last egg was weapon + accessories)
    ('Hunt for History', 'Hunt for History', utc(2026, 10, 16), 28, 2, ''),
    ("Holy Knight's Treasure – hruď, rukavice, topánky", "Holy Knight's Treasure – hruď, rukavice, boty",
     utc(2026, 10, 30), 84, 2, ''),
    ("Holy Knight's Treasure – prilba, nohavice", "Holy Knight's Treasure – helma, kalhoty",
     utc(2026, 11, 27), 84, 2, ''),
    ("Holy Knight's Treasure – zbraň, doplnky", "Holy Knight's Treasure – zbraň, doplňky",
     utc(2026, 12, 25), 84, 2, ''),
    ('More Than Gems', 'More Than Gems', utc(2026, 10, 10), 28, 2, 'more-than-gems'),
    # every second Friday 00:00 UTC for 48 h, confirmed by Gether (8. 10. 2026)
    ('20 GH', '20 GH', utc(2026, 10, 16), 14, 2, ''),
    # more regular events, added inactive for Gether to set up (9. 10. 2026); next dates, cycles and durations from
    # the codexhelper.com calendar API – an estimate, not game data
    ('Champions of Olympia', 'Champions of Olympia', utc(2026, 10, 10), 7, 2, 'champions-of-olympia'),
    ('Realm of Mystique', 'Realm of Mystique', utc(2026, 10, 12), 14, 2, ''),
    ('Armament: Reveal Thyself', 'Armament: Reveal Thyself', utc(2026, 10, 12), 28, 2, ''),
    ('Ceroli Crisis', 'Ceroli Crisis', utc(2026, 10, 19), 14, 3, 'ceroli-crisis'),
    ('Golden Kingdom', 'Golden Kingdom', utc(2026, 10, 21), 14, 3, 'golden-kingdom'),
    ("Dhalruk's Puzzle Box", "Dhalruk's Puzzle Box", utc(2026, 10, 26), 56, 2, ''),
]

MESSAGE = '**{name}** začína {start} ({relative}).'

# times offered to players for a game event starting at 00:00 UTC (Gether, 10. 10. 2026: no reminders at night)
GAME_PLAYER_REMINDERS = [EVENING_BEFORE, 180]

NOT_PLANNED = datetime(2026, 10, 1, 18, tzinfo=UTC)  # 20:00 in Bratislava – the usual evening hour

# Irregular events without a fixed cycle (named by Gether). Active right away without a date: players see "ďalší
# termín oznámime" and pick their reminders in advance; Gether sets the start (admin or the calendar) before each one.
# A start in the past = nothing planned yet.
# name SK, name CZ, start, duration in minutes, time basis, guide slug
IRREGULAR_TEMPLATES = [
    # the kingdom runs them at 20:00 our time, all year (Gether, 8. 10. 2026)
    ('Silk Road', 'Silk Road', NOT_PLANNED, 60, KingdomEvent.TimeBasis.LOCAL, ''),
    ('Shadow Legion', 'Shadow Legion', NOT_PLANNED, 60, KingdomEvent.TimeBasis.LOCAL, ''),
    ('Karuak Boss', 'Karuak Boss', NOT_PLANNED, 60, KingdomEvent.TimeBasis.LOCAL, ''),
    # the competition runs a week from Monday 00:00 UTC; 5.–12. 10. 2026 from Gether's screenshot of the game
    ('Alliance Mobilization', 'Alliance Mobilization', utc(2026, 10, 5), 7 * DAY, KingdomEvent.TimeBasis.UTC,
     'alliance-mobilization'),
]


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
            # 00:00 UTC is 1–2 am in Bratislava: 18:00 the day before, players also 3 h before (22:00 / 23:00)
            reminders=[EVENING_BEFORE],
            player_reminders=GAME_PLAYER_REMINDERS,
            guide=guides.get(guide),
            is_active=False,
        )
        created.append(name_sk)
    for name_sk, name_cs, start, minutes, basis, guide in IRREGULAR_TEMPLATES:
        if KingdomEvent.objects.filter(name_sk=name_sk).exists():
            continue
        evening = basis == KingdomEvent.TimeBasis.LOCAL
        KingdomEvent.objects.create(
            name_sk=name_sk,
            name_cs=name_cs if name_cs != name_sk else '',
            message=MESSAGE,
            starts_at=start,
            duration_minutes=minutes,
            irregular=True,
            time_basis=basis,
            # 00:00 UTC is at night here: the evening before instead of an hour before
            reminders=[60, 15] if evening else [EVENING_BEFORE],
            player_reminders=[15, 60] if evening else GAME_PLAYER_REMINDERS,
            guide=guides.get(guide),
            is_active=True,
        )
        created.append(name_sk)
    return created


def create_initial_events() -> list[str]:
    """Creates the events from INITIAL_EVENTS that do not exist yet (matched by the Slovak name).

    Guides are linked by slug, so this runs after sync_meta_guides. Returns the names it created.
    """
    from guides.models import Guide

    guides = {g.slug: g for g in Guide.objects.filter(category='eventy', is_published=True)}
    created = []
    for row in json.loads(INITIAL_EVENTS.read_text(encoding='utf-8')):
        if KingdomEvent.objects.filter(name_sk=row['name_sk']).exists():
            continue
        KingdomEvent.objects.create(
            **{
                **row,
                'starts_at': datetime.fromisoformat(row['starts_at']),
                'until': date.fromisoformat(row['until']) if row['until'] else None,
                'guide': guides.get(row['guide']),
            }
        )
        created.append(row['name_sk'])
    return created


# the columns of INITIAL_EVENTS, in the file's order
INITIAL_FIELDS = [
    'name_sk', 'name_cs', 'icon', 'message', 'starts_at', 'duration_minutes', 'repeat_days', 'until', 'irregular',
    'time_basis', 'reminders', 'mention_role_id', 'mention_role', 'notify_discord', 'show_on_web', 'player_reminders',
    'guide', 'is_active',
]  # fmt: skip


def export_initial_events() -> int:
    """Writes the dev database's events into INITIAL_EVENTS (the counterpart of create_initial_events).

    Events already in the file keep their place, new ones go to the end. Returns the number of events.
    """
    order = {row['name_sk']: i for i, row in enumerate(json.loads(INITIAL_EVENTS.read_text(encoding='utf-8')))}
    events = sorted(
        KingdomEvent.objects.select_related('guide').order_by('pk'), key=lambda e: order.get(e.name_sk, len(order))
    )
    rows = []
    for event in events:
        row = {field: getattr(event, field) for field in INITIAL_FIELDS}
        row['starts_at'] = event.starts_at.astimezone(UTC).isoformat()
        row['until'] = event.until.isoformat() if event.until else None
        row['guide'] = event.guide.slug if event.guide else None
        rows.append(row)
    INITIAL_EVENTS.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return len(rows)

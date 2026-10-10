"""Recurring kingdom events → occurrences → Discord reminders (EventNotification rows the worker sends)."""

import math
from datetime import UTC, datetime, time, timedelta
from itertools import islice
from zoneinfo import ZoneInfo

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .models import EVENING_BEFORE, EventNotification, KingdomEvent

LOCAL_TZ = ZoneInfo('Europe/Bratislava')
# reminders are created this far ahead; the worker plans every few minutes
HORIZON = timedelta(hours=48)


def occurrences(event: KingdomEvent, start: datetime, end: datetime | None = None):
    """Yields the event's start times (aware, UTC) within [start, end); end=None = no upper bound.

    'utc' keeps the same UTC hour (a pure timedelta), 'local' keeps the same wall-clock hour in Bratislava
    across daylight saving changes.
    """
    if event.until:
        # inclusive: the whole local day of `until`
        until_end = datetime.combine(event.until + timedelta(days=1), time.min, tzinfo=LOCAL_TZ)
        end = until_end if end is None else min(end, until_end)
    if not event.repeat_days:
        if start <= event.starts_at and (end is None or event.starts_at < end):
            yield event.starts_at.astimezone(UTC)
        return

    step = timedelta(days=event.repeat_days)
    if event.time_basis == KingdomEvent.TimeBasis.LOCAL:
        anchor = event.starts_at.astimezone(LOCAL_TZ).replace(tzinfo=None)

        def at(k):
            return (anchor + k * step).replace(tzinfo=LOCAL_TZ).astimezone(UTC)

        target = start.astimezone(LOCAL_TZ).replace(tzinfo=None)
    else:
        anchor = event.starts_at.astimezone(UTC)

        def at(k):
            return anchor + k * step

        target = start
    # jump to the first occurrence ≥ start; one step back absorbs the DST hour between wall clock and UTC
    k = max(0, math.ceil((target - anchor) / step) - 1)
    while at(k) < start:
        k += 1
    while end is None or at(k) < end:
        yield at(k)
        k += 1


def send_time(start: datetime, offset: int) -> datetime:
    """When the reminder `offset` (minutes before, or EVENING_BEFORE) of the occurrence `start` goes out (UTC)."""
    if offset == EVENING_BEFORE:
        day = start.astimezone(LOCAL_TZ).date() - timedelta(days=1)
        clock = time(hour=-offset // 60, minute=-offset % 60)
        return datetime.combine(day, clock, tzinfo=LOCAL_TZ).astimezone(UTC)
    return start - timedelta(minutes=offset)


def longest_lead(offset: int) -> timedelta:
    """The most a reminder can go out before the start: EVENING_BEFORE of an event at 23:59 is under 30 h ahead."""
    return timedelta(hours=31) if offset == EVENING_BEFORE else timedelta(minutes=offset)


def upcoming(event: KingdomEvent, count: int = 5, now=None) -> list[datetime]:
    return list(islice(occurrences(event, now or timezone.now()), count))


def overlapping(event: KingdomEvent, start: datetime, end: datetime | None = None):
    """Like occurrences(), but an occurrence that started before `start` and still runs then counts too."""
    length = timedelta(minutes=event.duration_minutes)
    for begin in occurrences(event, start - length, end):
        if not length or begin + length > start:
            yield begin


def calendar(events, start: datetime, end: datetime, limit: int, now=None) -> list[tuple[datetime, KingdomEvent]]:
    """(start, event) of every occurrence that overlaps [start, end), soonest first, at most `limit`.

    Irregular events count only from `now`: until leadership sets the next date their start is a placeholder in the
    past (event_templates.NOT_PLANNED). No event can have more than `limit` occurrences among the soonest `limit`, so
    each one stops there (a daily event with a very long duration would otherwise yield thousands).
    """
    now = now or timezone.now()
    found = [
        (begin, event)
        for event in events
        for begin in islice(overlapping(event, max(start, now) if event.irregular else start, end), limit)
    ]
    found.sort(key=lambda pair: (pair[0], pair[1].pk))
    return found[:limit]


def render(event: KingdomEvent, occurrence: datetime) -> str:
    """Expands {name}, {start}, {relative} and {end} into Discord timestamps; other braces stay as they are."""
    unix = int(occurrence.timestamp())
    end = f'<t:{unix + event.duration_minutes * 60}:t>' if event.duration_minutes else ''
    text = event.message
    for key, value in {
        '{name}': event.name_sk,
        '{start}': f'<t:{unix}:F>',
        '{relative}': f'<t:{unix}:R>',
        '{end}': end,
    }.items():
        text = text.replace(key, value)
    return text


def plan_reminders(now=None, horizon=HORIZON, events=None) -> int:
    """Creates the PENDING reminders whose send time falls within (now, now + horizon]. Returns how many are new.

    Idempotent: an existing row (also a cancelled or sent one) is never created again. Without a webhook nothing
    is planned – every row would end as an error.
    """
    if not settings.DISCORD_WEBHOOK_URL:
        return 0
    now = now or timezone.now()
    if events is None:
        events = KingdomEvent.objects.all()
    created = 0
    # SQLite runs atomic() as BEGIN IMMEDIATE: an admin edit cannot slip in between reading an event and writing
    # its reminders, so the worker never recreates rows for a time that replan() has just removed
    with transaction.atomic():
        for event in events.filter(is_active=True, notify_discord=True):
            offsets = set(event.reminders or [])
            if not offsets:
                continue
            window_end = now + horizon + max(map(longest_lead, offsets)) + timedelta(microseconds=1)
            for start in occurrences(event, now, window_end):
                for offset in offsets:
                    send_at = send_time(start, offset)
                    if not now < send_at <= now + horizon:
                        continue
                    _, new = EventNotification.objects.get_or_create(
                        event=event,
                        occurrence_start=start,
                        offset_minutes=offset,
                        defaults={
                            'title': event.name_sk,
                            'message': render(event, start),
                            'send_at': send_at,
                            'event_start': start,
                            'mention_role': event.mention_role,
                            'mention_role_id': event.mention_role_id,
                        },
                    )
                    created += new
    return created


def replan(event: KingdomEvent, now=None) -> int:
    """After an edit: drops the event's future PENDING reminders and plans them again from the new definition.

    Sent, failed and cancelled rows stay (a cancelled reminder is therefore not recreated). Without a webhook the
    outdated rows are still removed, only nothing new is planned.
    """
    now = now or timezone.now()
    with transaction.atomic():
        event.notifications.filter(status=EventNotification.Status.PENDING, send_at__gt=now).delete()
        return plan_reminders(now=now, events=KingdomEvent.objects.filter(pk=event.pk))

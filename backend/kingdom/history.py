"""The dates of irregular events (Gether 7. 11. 2026: "pamätať, kedy boli naposledy, možno časom budeme vedieť nastaviť
ako pravidelné"): KingdomEvent.starts_at of an irregular event is overwritten with every new date, so each one is
written to EventDate when it is set, and the usual gap between them gives a guess of the next one – for the superadmin
in the calendar only, never for the players (the game has not confirmed it)."""

from datetime import UTC, datetime, timedelta
from statistics import median

from django.utils import timezone

from .models import EventDate, KingdomEvent

# a guess from two dates on – the calendar calls it a guess; more dates make it better
GUESS_FROM = 2
# the dates shown in the calendar
SHOWN = 8


def placeholder(event: KingdomEvent) -> bool:
    """"no date yet": the start in the past at the usual hour the calendar keeps for such events (manage_api.unplanned)"""
    from .event_templates import NOT_PLANNED  # imports this app's models

    return abs(event.starts_at - NOT_PLANNED) <= timedelta(days=1)


def record(event: KingdomEvent, before: datetime | None, now: datetime | None = None) -> None:
    """After a save: the new date into the history; the old one out of it if it had not happened yet (a correction or a
    cancelled date)."""
    now = now or timezone.now()
    if before and before != event.starts_at and before > now:
        EventDate.objects.filter(event=event, start=before).delete()
    if placeholder(event):
        return
    end = event.starts_at + timedelta(minutes=event.duration_minutes) if event.duration_minutes else None
    EventDate.objects.update_or_create(event=event, start=event.starts_at, defaults={'end': end})


def summary(event: KingdomEvent, now: datetime | None = None) -> dict:
    """{dates: newest first (ISO), every_days: the usual gap in whole days or None, guess: the next date after the last
    one (ISO) or None} – the guess from GUESS_FROM dates on, moved forward past today by the same gap"""
    now = now or timezone.now()
    starts = sorted(d.start for d in event.past_dates.all())
    gaps = [(b - a).total_seconds() / 86400 for a, b in zip(starts, starts[1:])]
    every = round(median(gaps)) if gaps else None
    guess = None
    if every and len(starts) >= GUESS_FROM:
        guess = starts[-1] + timedelta(days=every)
        while guess < now:
            guess += timedelta(days=every)
    iso = lambda moment: moment.astimezone(UTC).isoformat().replace('+00:00', 'Z')  # noqa: E731
    return {
        'dates': [iso(start) for start in reversed(starts[-SHOWN:])],
        'every_days': every,
        'guess': iso(guess) if guess else None,
    }

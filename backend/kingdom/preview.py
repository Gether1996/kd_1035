"""Open Graph page of one calendar event for link-preview bots (Discord, Facebook…), which do not run JavaScript.

The calendar page is prerendered with its generic meta only. nginx sends known preview bots asking for
/[cz/]kalendar?event=<id>[&on=<day>] here (frontend/nginx/default.conf.template), so a link posted on Discord reads
"Ark of Osiris · 14.–18. 10. 2026" instead of the calendar's own card. Same pattern as guides.views.link_preview.
"""

import re
from datetime import UTC, date, datetime, timedelta

from django.utils import timezone
from django.views.decorators.http import require_GET

from guides.views import CALENDAR_META, EVENT_META, preview_page

from . import events
from .models import KingdomEvent
from .views import parse_day, site_origin

EVENT_ID = re.compile(r'[0-9]{1,9}')
# a multi-day run ending before 06:00 does not take that day (NIGHT_ENDS_AT in pages/calendar/month.ts, daysOf())
NIGHT_ENDS_AT = 6


def run_days(begin: datetime, minutes: int) -> tuple[date, date]:
    """First and last local day (Europe/Bratislava) of a run, like daysOf() on the web: an end at midnight belongs to
    the day before, and so does the night tail of a multi-day event."""
    first = begin.astimezone(events.LOCAL_TZ).date()
    if not minutes:
        return first, first
    end = (begin + timedelta(minutes=minutes, microseconds=-1)).astimezone(events.LOCAL_TZ)
    last = end.date()
    if last > first and end.hour < NIGHT_ENDS_AT:
        last -= timedelta(days=1)
    return first, last


def day_text(day: date) -> str:
    return f'{day.day}. {day.month}. {day.year}'


def days_text(first: date, last: date) -> str:
    """'14. 10. 2026', '14.–18. 10. 2026', '30. 10. – 2. 11. 2026' (the same in Slovak and Czech)."""
    if first == last:
        return day_text(first)
    if (first.year, first.month) == (last.year, last.month):
        return f'{first.day}.–{last.day}. {last.month}. {last.year}'
    if first.year == last.year:
        return f'{first.day}. {first.month}. – {day_text(last)}'
    return f'{day_text(first)} – {day_text(last)}'


def shows_clock(event: KingdomEvent) -> bool:
    """showsClock() in shared/event-time.ts: only a short irregular event (Silk Road) needs its time; game events start
    at 00:00 UTC and run for days."""
    return event.irregular and (not event.duration_minutes or event.duration_minutes < 24 * 60)


def run_title(event: KingdomEvent, name: str, begin: datetime) -> str:
    title = f'{name} · {days_text(*run_days(begin, event.duration_minutes))}'
    if shows_clock(event):
        title += f' · {begin.astimezone(UTC):%H:%M} UTC'
    return title


@require_GET
def event_preview(request, cz=None):
    """GET /api/link-preview/[cz/]kalendar?event=<id>[&on=YYYY-MM-DD] – what a calendar link to one event shows.

    `on` (a day in Europe/Bratislava) picks the run like the .ics download (events.run_on()). Without it, or when the
    event has no run that day (an irregular event moved to a new date), the card shows the event's next or running
    run, and an event without one says that the next date will be announced. An unknown, hidden or inactive event and
    a malformed id or day are a 404 with the calendar's generic meta – the name of a hidden event never leaks.
    """
    lang = 'cs' if cz else 'sk'
    origin = site_origin(request)
    calendar_url = f'{origin}{"/cz" if cz else ""}/kalendar'
    raw_id, raw_day = request.GET.get('event', ''), request.GET.get('on')
    try:
        if not EVENT_ID.fullmatch(raw_id):
            raise ValueError(raw_id)
        day = parse_day(raw_day) if raw_day is not None else None
    except ValueError:  # a malformed id or day, an impossible day (2026-02-30) or one out of range (9999-12-31)
        event = None
    else:
        event = KingdomEvent.objects.filter(pk=raw_id, is_active=True, show_on_web=True).first()
    if event is None:
        title, description = CALENDAR_META[lang]
        return preview_page(request, lang, origin, 404, title=title, description=description, url=calendar_url)

    name = (cz and event.name_cs) or event.name_sk
    begin = (day and events.run_on(event, day)) or next(events.overlapping(event, timezone.now()), None)
    dated, undated = EVENT_META[lang]
    if not begin:
        title, description, query = name, undated, f'?event={event.pk}'
    else:
        first_day = begin.astimezone(events.LOCAL_TZ).date()
        title, description = run_title(event, name, begin), dated
        query = f'?event={event.pk}&on={first_day.isoformat()}'
    return preview_page(
        request,
        lang,
        origin,
        200,
        title=title,
        page_title=f'{title} | KD 1035',
        description=description,
        url=calendar_url + query,
    )

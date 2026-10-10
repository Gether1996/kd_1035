"""Kingdom events as iCalendar (RFC 5545) for Google, iOS/macOS or Outlook calendars: the file of one run and the
subscribed feed of all public events."""

from datetime import UTC, datetime

CRLF = '\r\n'
# a content line has at most 75 octets without its line break; a continuation line starts with one space
LINE_OCTETS = 75


def escape(text: str) -> str:
    """TEXT value: backslash, semicolon, comma and line breaks escaped (RFC 5545 §3.3.11)."""
    text = text.replace('\\', '\\\\').replace(';', '\\;').replace(',', '\\,')
    return text.replace('\r\n', '\\n').replace('\n', '\\n').replace('\r', '\\n')


def fold(line: str) -> str:
    """Folds a content line at 75 octets (RFC 5545 §3.1) – never inside a multi-byte UTF-8 character."""
    parts, current, size, limit = [], '', 0, LINE_OCTETS
    for char in line:
        width = len(char.encode())
        if size + width > limit:
            parts.append(current)
            # the leading space of a continuation line counts towards its 75 octets
            current, size, limit = '', 0, LINE_OCTETS - 1
        current += char
        size += width
    parts.append(current)
    return (CRLF + ' ').join(parts)


def stamp(moment: datetime) -> str:
    """UTC date-time with Z: 20261014T000000Z."""
    return moment.astimezone(UTC).strftime('%Y%m%dT%H%M%SZ')


# the same header for a single run and for the whole feed
HEADER = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//KD 1035//Kalendar//SK',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
]
# how often a subscribed calendar should ask again (Apple and Outlook honour it, Google refreshes on its own schedule)
REFRESH = 'PT6H'


def content(lines: list[str]) -> str:
    """Content lines folded, each ending with CRLF."""
    return ''.join(fold(line) + CRLF for line in lines)


def vevent_lines(
    *, uid: str, name: str, start: datetime, end: datetime | None, url: str, description: str, now: datetime
) -> list[str]:
    """One VEVENT; no DTEND for an event without an end (the calendar shows just its start)."""
    lines = [
        'BEGIN:VEVENT',
        f'UID:{uid}',
        f'DTSTAMP:{stamp(now)}',
        f'DTSTART:{stamp(start)}',
    ]
    if end:
        lines.append(f'DTEND:{stamp(end)}')
    return lines + [
        f'SUMMARY:{escape(name)}',
        # URL is a URI value, not TEXT – no escaping
        f'URL:{url}',
        f'DESCRIPTION:{escape(description)}',
        'END:VEVENT',
    ]


def event_file(
    *, uid: str, name: str, start: datetime, end: datetime | None, url: str, description: str, now: datetime
) -> str:
    """A VCALENDAR with one VEVENT – the .ics file of one run."""
    vevent = vevent_lines(uid=uid, name=name, start=start, end=end, url=url, description=description, now=now)
    return content([*HEADER, *vevent, 'END:VCALENDAR'])


def calendar_file(vevents: list[list[str]], *, name: str) -> str:
    """A subscribed calendar (feed): its name, how often to refresh it and every VEVENT; may have none."""
    return content(
        [
            *HEADER,
            f'X-WR-CALNAME:{escape(name)}',
            f'REFRESH-INTERVAL;VALUE=DURATION:{REFRESH}',
            f'X-PUBLISHED-TTL:{REFRESH}',
            *(line for vevent in vevents for line in vevent),
            'END:VCALENDAR',
        ]
    )

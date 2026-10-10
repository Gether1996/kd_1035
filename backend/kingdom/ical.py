"""One run of a kingdom event as an iCalendar file (RFC 5545) for Google, iOS/macOS or Outlook calendars."""

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


def event_file(
    *, uid: str, name: str, start: datetime, end: datetime | None, url: str, description: str, now: datetime
) -> str:
    """A VCALENDAR with one VEVENT; no DTEND for an event without an end (the calendar shows just its start)."""
    lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//KD 1035//Kalendar//SK',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        f'UID:{uid}',
        f'DTSTAMP:{stamp(now)}',
        f'DTSTART:{stamp(start)}',
    ]
    if end:
        lines.append(f'DTEND:{stamp(end)}')
    lines += [
        f'SUMMARY:{escape(name)}',
        # URL is a URI value, not TEXT – no escaping
        f'URL:{url}',
        f'DESCRIPTION:{escape(description)}',
        'END:VEVENT',
        'END:VCALENDAR',
    ]
    return ''.join(fold(line) + CRLF for line in lines)

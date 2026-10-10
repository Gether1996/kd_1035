/** One event run for the visitor's own calendar: Google Calendar's "add event" link. The .ics file comes from
 * /api/events/<id>/ics (backend kingdom/ical.py), so the browser needs no iCalendar code. */

export interface CalendarRun {
  name: string;
  /** ISO 8601 */
  start: string;
  /** null = no end; Google then gets one hour */
  end: string | null;
  details: string;
}

const HOUR = 60 * 60 * 1000;

/** 2026-10-14T00:00:00Z → 20261014T000000Z */
export function utcStamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/[-:]/g, '');
}

/** https://calendar.google.com/calendar/render?action=TEMPLATE… prefilled with the run in UTC. */
export function googleUrl(run: CalendarRun): string {
  const start = new Date(run.start);
  const end = run.end ? new Date(run.end) : new Date(start.getTime() + HOUR);
  return (
    'https://calendar.google.com/calendar/render?action=TEMPLATE' +
    `&text=${encodeURIComponent(run.name)}` +
    `&dates=${utcStamp(start)}/${utcStamp(end)}` +
    `&details=${encodeURIComponent(run.details)}`
  );
}

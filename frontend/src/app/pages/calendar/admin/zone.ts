import { TimeBasis } from '../../../core/events-admin-api';

/** "Náš čas" of the events (the server's 'local' time basis), whatever zone the browser is in */
export const KINGDOM_ZONE = 'Europe/Bratislava';

export function zoneOf(basis: TimeBasis): string {
  return basis === 'utc' ? 'UTC' : KINGDOM_ZONE;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Date (YYYY-MM-DD) and time (HH:MM) of an instant on the wall clock of `zone`. */
export function wallClock(iso: string | number, zone: string): { date: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(iso))
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts['year']}-${parts['month']}-${parts['day']}`,
    time: `${parts['hour']}:${parts['minute']}`,
  };
}

/** How far `zone` is ahead of UTC at the instant `ms`, in ms. */
function offset(ms: number, zone: string): number {
  const { date, time } = wallClock(ms, zone);
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  return Date.UTC(y, m - 1, d, h, min) - Math.floor(ms / 60_000) * 60_000;
}

/** The instant of a wall-clock date and time in `zone` as ISO 8601 in UTC ("2026-10-25T19:00:00Z"); null when the
 * date or time is not valid. */
export function toInstant(date: string, time: string, zone: string): string | null {
  if (!DATE.test(date) || !TIME.test(time)) return null;
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, min);
  if (new Date(guess).getUTCDate() !== d) return null; // 31 November…
  // the offset at the guess can be an hour off around a daylight saving change – a second pass settles it
  let ms = guess - offset(guess, zone);
  ms = guess - offset(ms, zone);
  return new Date(ms).toISOString().replace('.000Z', 'Z');
}

/** YYYY-MM-DD `days` days after `date`. */
export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

import { Occurrence } from '../../core/events-api';
import { DayKey, dayKey, keyDate } from './month';

/** The kingdom's days – `on` in a calendar link is a day here, like the days of /api/events/. */
export const KINGDOM_ZONE = 'Europe/Bratislava';

/** Query of a link that opens the calendar on an event's dialog: /kalendar?event=<id>&on=<YYYY-MM-DD>.
 * `on` is the day the run is shown for (its first day, or today while it runs), so the calendar opens that month –
 * a run in the next month is found as well. The home page's upcoming events link this way. */
export function calendarQuery(item: Pick<Occurrence, 'id' | 'start'>, now: Date): { event: number; on: DayKey } {
  const first = dayKey(new Date(item.start), KINGDOM_ZONE);
  const today = dayKey(now, KINGDOM_ZONE);
  return { event: item.id, on: first > today ? first : today };
}

/** `on` from the address when it is a real day, otherwise null (the calendar then opens the current month). */
export function validDay(value: string | undefined | null): DayKey | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = keyDate(value);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

/** Whether a run takes place on `day` (the kingdom's days, from its start to its exact end). */
export function runsOn(item: Occurrence, day: DayKey): boolean {
  const first = dayKey(new Date(item.start), KINGDOM_ZONE);
  const end = item.end && Date.parse(item.end) > Date.parse(item.start) ? Date.parse(item.end) - 1 : null;
  const last = end === null ? first : dayKey(new Date(end), KINGDOM_ZONE);
  return first <= day && day <= last;
}

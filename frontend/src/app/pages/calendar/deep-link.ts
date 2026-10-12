import { Occurrence, PublicEvent } from '../../core/events-api';
import { KINGDOM_ZONE } from '../../core/kingdom-zone';
import { DayKey, dayKey, keyDate } from './month';

export { KINGDOM_ZONE };

/** Query of a link that opens the calendar on an event's dialog: /kalendar?event=<id>&on=<YYYY-MM-DD>.
 * `on` is the day the run is shown for (its first day, or today while it runs), so the calendar opens that month –
 * a run in the next month is found as well. A run that is over keeps its first day (with `end` given), otherwise the
 * link would open the next run. The home page's upcoming events link this way. */
export function calendarQuery(
  item: Pick<Occurrence, 'id' | 'start'> & { end?: string | null },
  now: Date,
): { event: number; on: DayKey } {
  const first = dayKey(new Date(item.start), KINGDOM_ZONE);
  const today = dayKey(now, KINGDOM_ZONE);
  const over = item.end !== undefined && Date.parse(item.end ?? item.start) <= now.getTime();
  return { event: item.id, on: first > today || over ? first : today };
}

/** The query of a link to an event's dialog as router query params: the day of a run (calendarQuery), `on: null` for
 * an irregular event still without a date. The calendar keeps them in its address while the dialog is open. */
export function eventParams(
  item: Pick<PublicEvent, 'id'> & { start?: string | null; end?: string | null },
  now: Date,
): { event: number; on: DayKey | null } {
  if (!item.start) return { event: item.id, on: null };
  return calendarQuery({ id: item.id, start: item.start, end: item.end ?? null }, now);
}

/** The query part of a link to an event's dialog: `?event=<id>&on=<day>` for a run (eventParams), `?event=<id>`
 * for an irregular event still without a date. Put after `i18n.path('calendar')` – the login return, the link in a
 * calendar export and "Kopírovať odkaz na event" all use it. */
export function eventLink(
  item: Pick<PublicEvent, 'id'> & { start?: string | null; end?: string | null },
  now: Date,
): string {
  const { event, on } = eventParams(item, now);
  return on ? `?event=${event}&on=${on}` : `?event=${event}`;
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

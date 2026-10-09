import { Occurrence } from '../core/events-api';

/** Only a short irregular event (Silk Road in the evening) needs its clock; game events start at 00:00 UTC and run
 *  for days (MGE, Alliance Mobilization…), so their day says enough. `minutes` = duration, 0 or null = no end.
 *  The calendar, /pripomienky and the home page's upcoming events all follow it. */
export function showsClock(irregular: boolean, minutes: number | null): boolean {
  return irregular && (!minutes || minutes < 24 * 60);
}

/** `showsClock()` for one run of an event (its duration from start and end). */
export function occurrenceShowsClock(item: Pick<Occurrence, 'irregular' | 'start' | 'end'>): boolean {
  const minutes = item.end ? (Date.parse(item.end) - Date.parse(item.start)) / 60_000 : null;
  return showsClock(item.irregular, minutes);
}

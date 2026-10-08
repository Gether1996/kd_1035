import { Occurrence } from '../../core/events-api';

/**
 * Month grid of the calendar. Days are 'YYYY-MM-DD' keys (they sort as strings); date arithmetic runs on whole days in
 * UTC, so a daylight saving change never adds or drops a day. Instants become days in the visitor's own time zone
 * (`timeZone` undefined) – tests pass one explicitly.
 */
export type DayKey = string;

/** `month` 0–11 like Date */
export interface Month {
  year: number;
  month: number;
}

/** One occurrence in one week row: columns 0 (Monday) … 6 (Sunday), the same lane on every day it runs. */
export interface Bar {
  item: Occurrence;
  lane: number;
  from: number;
  to: number;
  /** the occurrence begins in this week (otherwise it continues from the previous one) */
  starts: boolean;
  /** …and ends in it */
  ends: boolean;
}

export interface Week {
  days: DayKey[];
  /** in reading order: by the first column, then by lane */
  bars: Bar[];
  lanes: number;
}

export interface AgendaDay {
  key: DayKey;
  items: Occurrence[];
}

/** A multi-day event ending before this hour does not run on its last day for the grid: game events end at 00:00 UTC,
 * which is 1–2 am here, and a bar over the whole next day would say it still runs then. The dialog shows the end. */
const NIGHT_ENDS_AT = 6;

const formats = new Map<string, Intl.DateTimeFormat>();

/** Date and hour of `date` in `timeZone` (the browser's zone when undefined). */
function wallClock(date: Date, timeZone?: string): Record<string, string> {
  let format = formats.get(timeZone ?? '');
  if (!format) {
    const parts = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    } as const;
    format = new Intl.DateTimeFormat('en-US', { timeZone, ...parts });
    formats.set(timeZone ?? '', format);
  }
  return Object.fromEntries(format.formatToParts(date).map((part) => [part.type, part.value]));
}

/** The day of `date` in `timeZone` (the browser's zone when undefined). */
export function dayKey(date: Date, timeZone?: string): DayKey {
  const parts = wallClock(date, timeZone);
  return `${parts['year']}-${parts['month']}-${parts['day']}`;
}

/** Midnight UTC of the day – for arithmetic and for formatting the day itself (with timeZone 'UTC'). */
export function keyDate(key: DayKey): Date {
  return new Date(`${key}T00:00:00Z`);
}

export function addDays(key: DayKey, days: number): DayKey {
  const date = keyDate(key);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** 0 = Monday … 6 = Sunday */
export function weekday(key: DayKey): number {
  return (keyDate(key).getUTCDay() + 6) % 7;
}

export function monthOf(key: DayKey): Month {
  return { year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) - 1 };
}

export function addMonths({ year, month }: Month, months: number): Month {
  const total = year * 12 + month + months;
  return { year: Math.floor(total / 12), month: total % 12 };
}

export function monthBounds({ year, month }: Month): { first: DayKey; last: DayKey } {
  return {
    first: new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10),
    last: new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10),
  };
}

/** Monday to Sunday rows covering the month, with the end of the previous and the start of the next month. */
export function monthWeeks(month: Month): DayKey[][] {
  const { first, last } = monthBounds(month);
  const weeks: DayKey[][] = [];
  for (let monday = addDays(first, -weekday(first)); monday <= last; monday = addDays(monday, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(monday, i)));
  }
  return weeks;
}

/** First and last day an occurrence runs on: an end at midnight belongs to the day before, and so does the night
 * tail of a multi-day event (NIGHT_ENDS_AT). */
export function daysOf(item: Occurrence, timeZone?: string): { first: DayKey; last: DayKey } {
  const first = dayKey(new Date(item.start), timeZone);
  if (!item.end || Date.parse(item.end) <= Date.parse(item.start)) return { first, last: first };
  const end = new Date(Date.parse(item.end) - 1);
  const last = dayKey(end, timeZone);
  const night = last > first && Number(wallClock(end, timeZone)['hour']) < NIGHT_ENDS_AT;
  return { first, last: night ? addDays(last, -1) : last };
}

/** Events repeating every day are listed once ("Každý deň") instead of filling every day of the month. */
export function isDaily(item: Occurrence): boolean {
  return item.repeat_days === 1 && !item.irregular;
}

/** A bar per occurrence and week row; overlapping ones get separate lanes, so a multi-day event stays on one line. */
export function layoutWeeks(weeks: DayKey[][], items: Occurrence[], timeZone?: string): Week[] {
  const spans = items.map((item) => ({ item, ...daysOf(item, timeZone) }));
  return weeks.map((days) => {
    const [monday, sunday] = [days[0], days[6]];
    const bars: Bar[] = spans
      .filter((span) => span.first <= sunday && span.last >= monday)
      .map((span) => ({
        item: span.item,
        lane: 0,
        from: span.first < monday ? 0 : days.indexOf(span.first),
        to: span.last > sunday ? 6 : days.indexOf(span.last),
        starts: span.first >= monday,
        ends: span.last <= sunday,
      }))
      // earliest first and the longer of two that start the same day first: the short ones fill the gaps
      .sort(
        (a, b) =>
          a.from - b.from ||
          b.to - a.to ||
          Date.parse(a.item.start) - Date.parse(b.item.start) ||
          a.item.id - b.item.id,
      );
    const laneEnds: number[] = [];
    for (const bar of bars) {
      bar.lane = laneEnds.findIndex((end) => end < bar.from);
      if (bar.lane < 0) bar.lane = laneEnds.length;
      laneEnds[bar.lane] = bar.to;
    }
    return { days, bars, lanes: laneEnds.length };
  });
}

/** Phones: each occurrence of the month once, under the day it begins – or under `since` (today in the current month,
 * the 1st otherwise) when it began earlier and still runs then; the ones over by then are left out. */
export function agenda(items: Occurrence[], month: Month, since?: DayKey, timeZone?: string): AgendaDay[] {
  const bounds = monthBounds(month);
  const first = since && since > bounds.first && since <= bounds.last ? since : bounds.first;
  const last = bounds.last;
  const groups = new Map<DayKey, Occurrence[]>();
  for (const item of items) {
    const days = daysOf(item, timeZone);
    if (days.last < first || days.first > last) continue;
    const key = days.first < first ? first : days.first;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([key, list]) => ({ key, items: list }));
}

/** "20:00" */
export function clock(date: Date | string, locale: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone }).format(new Date(date));
}

/** "štvrtok 8. októbra" */
export function longDay(key: DayKey, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(keyDate(key));
}

/** "11. 10." – the same in Slovak and Czech */
export function numericDay(key: DayKey): string {
  return `${Number(key.slice(8, 10))}. ${Number(key.slice(5, 7))}.`;
}

/** "ne 11. 10." */
export function shortDay(key: DayKey, locale: string): string {
  const weekdayName = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(keyDate(key));
  return `${weekdayName} ${numericDay(key)}`;
}

/** "október 2026" */
export function monthTitle(month: Month, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(keyDate(monthBounds(month).first));
}

/** "po" … "ne" */
export function weekdayNames(locale: string): string[] {
  const format = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
  return Array.from({ length: 7 }, (_, i) => format.format(keyDate(addDays('2026-10-05', i)))); // a Monday
}

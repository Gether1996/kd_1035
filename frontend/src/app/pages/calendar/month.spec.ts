import { Occurrence } from '../../core/events-api';
import {
  addDays,
  addMonths,
  agenda,
  dayKey,
  daysOf,
  isDaily,
  layoutWeeks,
  monthTitle,
  monthWeeks,
  shortDay,
  weekdayNames,
} from './month';

const TZ = 'Europe/Bratislava';

function occurrence(id: number, start: string, end: string | null, extra: Partial<Occurrence> = {}): Occurrence {
  return {
    id,
    name_sk: `Event ${id}`,
    name_cs: '',
    offered: [],
    guide: null,
    start,
    end,
    repeat_days: 14,
    irregular: false,
    ...extra,
  };
}

describe('month grid', () => {
  it('weeks start on Monday and cover the whole month', () => {
    const october = monthWeeks({ year: 2026, month: 9 }); // Thursday 1 → Saturday 31
    expect(october.length).toBe(5);
    expect(october[0][0]).toBe('2026-09-28');
    expect(october.at(-1)![6]).toBe('2026-11-01');
    expect(october.every((week) => week.length === 7)).toBe(true);

    // starts on Monday → no days of the previous month; Sunday 1 March → six rows
    expect(monthWeeks({ year: 2026, month: 5 })[0][0]).toBe('2026-06-01');
    expect(monthWeeks({ year: 2026, month: 2 }).length).toBe(6);
    expect(addMonths({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
    expect(addMonths({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
  });

  it('keeps whole days across the October daylight saving change', () => {
    // Sunday 25 October 2026 has 25 hours in Bratislava
    const week = monthWeeks({ year: 2026, month: 9 })[3];
    expect(week).toEqual([
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
    ]);
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
    // 00:30 local before the change is still the 25th, 23:30 UTC after it already the 26th
    expect(dayKey(new Date('2026-10-24T22:30:00Z'), TZ)).toBe('2026-10-25');
    expect(dayKey(new Date('2026-10-25T23:30:00Z'), TZ)).toBe('2026-10-26');
    expect(dayKey(new Date('2026-10-25T23:30:00Z'), 'UTC')).toBe('2026-10-25');
  });

  it('a multi-day event runs on each of its local days, without the night tail', () => {
    // MGE: Monday 00:00 UTC → Sunday 00:00 UTC = Monday 02:00 → Sunday 02:00 in Bratislava
    const mge = occurrence(1, '2026-10-05T00:00:00Z', '2026-10-11T00:00:00Z');
    expect(daysOf(mge, TZ)).toEqual({ first: '2026-10-05', last: '2026-10-10' });
    // an end at midnight belongs to the day before; an evening event stays on its day
    expect(daysOf(occurrence(2, '2026-10-13T18:00:00Z', '2026-10-13T22:00:00Z'), TZ)).toEqual({
      first: '2026-10-13',
      last: '2026-10-13',
    });
    // one night only (22:00 → 01:00): its start day
    expect(daysOf(occurrence(3, '2026-10-13T20:00:00Z', '2026-10-13T23:00:00Z'), TZ).last).toBe('2026-10-13');
    // ends in the morning → that day counts
    expect(daysOf(occurrence(4, '2026-10-13T18:00:00Z', '2026-10-14T08:00:00Z'), TZ).last).toBe('2026-10-14');
    expect(daysOf(occurrence(5, '2026-10-13T18:00:00Z', null), TZ)).toEqual({
      first: '2026-10-13',
      last: '2026-10-13',
    });
  });

  it('lays bars over the weeks in lanes, split where a week ends', () => {
    const weeks = monthWeeks({ year: 2026, month: 9 });
    const mge = occurrence(1, '2026-10-05T00:00:00Z', '2026-10-11T00:00:00Z');
    const wheel = occurrence(2, '2026-10-06T00:00:00Z', '2026-10-09T00:00:00Z');
    const gems = occurrence(3, '2026-10-10T00:00:00Z', '2026-10-12T00:00:00Z');
    // Wednesday 28 October → Monday 2 November 01:00 (winter time)
    const ark = occurrence(4, '2026-10-28T00:00:00Z', '2026-11-02T00:00:00Z');
    const layout = layoutWeeks(weeks, [mge, wheel, gems, ark], TZ);

    const second = layout[1];
    expect(second.lanes).toBe(2);
    const bar = (id: number) => second.bars.find((b) => b.item.id === id)!;
    expect([bar(1).from, bar(1).to, bar(1).lane, bar(1).starts, bar(1).ends]).toEqual([0, 5, 0, true, true]);
    expect([bar(2).from, bar(2).to, bar(2).lane]).toEqual([1, 3, 1]);
    // Saturday–Sunday: lane 1 is free again after Wheel of Fortune
    expect([bar(3).from, bar(3).to, bar(3).lane]).toEqual([5, 6, 1]);

    // Ark: Wednesday to Sunday of the last row (the 1 a.m. end on Monday is only its night tail)
    const last = layout[4].bars.find((b) => b.item.id === 4)!;
    expect([last.from, last.to, last.starts, last.ends]).toEqual([2, 6, true, true]);
    expect(layout[0].bars).toEqual([]);

    // a bar continuing into the next row
    const long = occurrence(5, '2026-10-02T10:00:00Z', '2026-10-06T10:00:00Z');
    const [first, next] = layoutWeeks(weeks.slice(0, 2), [long], TZ).map((w) => w.bars[0]);
    expect([first.from, first.to, first.starts, first.ends]).toEqual([4, 6, true, false]);
    expect([next.from, next.to, next.starts, next.ends]).toEqual([0, 1, false, true]);
  });

  it('agenda: once per occurrence, from today in the current month', () => {
    const mge = occurrence(1, '2026-10-05T00:00:00Z', '2026-10-11T00:00:00Z');
    const silk = occurrence(2, '2026-10-13T18:00:00Z', '2026-10-13T19:00:00Z');
    const old = occurrence(3, '2026-10-01T18:00:00Z', '2026-10-01T19:00:00Z');
    const september = occurrence(4, '2026-09-29T00:00:00Z', '2026-10-03T00:00:00Z');
    const october = { year: 2026, month: 9 };
    const items = [september, old, mge, silk];

    expect(agenda(items, october, undefined, TZ).map((d) => [d.key, d.items.map((i) => i.id)])).toEqual([
      ['2026-10-01', [4, 3]], // still running on the 1st
      ['2026-10-05', [1]],
      ['2026-10-13', [2]],
    ]);
    // today = 8 October: what is over is left out, what runs is listed under today
    expect(agenda(items, october, '2026-10-08', TZ).map((d) => [d.key, d.items.map((i) => i.id)])).toEqual([
      ['2026-10-08', [1]],
      ['2026-10-13', [2]],
    ]);
    // another month ignores today
    expect(agenda(items, { year: 2026, month: 8 }, '2026-10-08', TZ).map((d) => d.key)).toEqual(['2026-09-29']);
  });

  it('daily events are listed apart', () => {
    expect(isDaily(occurrence(1, '2026-10-13T18:00:00Z', null, { repeat_days: 1 }))).toBe(true);
    expect(isDaily(occurrence(2, '2026-10-13T18:00:00Z', null, { repeat_days: 7 }))).toBe(false);
  });

  it('names months and days in Slovak and Czech', () => {
    expect(monthTitle({ year: 2026, month: 9 }, 'sk-SK')).toBe('október 2026');
    expect(monthTitle({ year: 2026, month: 9 }, 'cs-CZ')).toBe('říjen 2026');
    expect(weekdayNames('sk-SK')).toEqual(['po', 'ut', 'st', 'št', 'pi', 'so', 'ne']);
    expect(shortDay('2026-10-11', 'sk-SK')).toBe('ne 11. 10.');
  });
});

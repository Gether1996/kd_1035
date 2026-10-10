import { Occurrence } from '../../core/events-api';
import { calendarQuery, eventLink, runsOn, validDay } from './deep-link';

const run = (start: string, end: string | null): Occurrence => ({
  id: 7,
  name_sk: 'Ark of Osiris',
  name_cs: '',
  icon: null,
  offered: [],
  guide: null,
  start,
  end,
  repeat_days: 14,
  irregular: false,
});

describe('calendar deep link', () => {
  const now = new Date('2026-10-09T10:00:00Z');

  it('names the first day of a coming run, today for a running one (days in Bratislava)', () => {
    expect(calendarQuery(run('2026-11-02T00:00:00Z', '2026-11-07T00:00:00Z'), now)).toEqual({
      event: 7,
      on: '2026-11-02',
    });
    expect(calendarQuery(run('2026-10-05T00:00:00Z', '2026-10-11T00:00:00Z'), now).on).toBe('2026-10-09');
    // 23:30 UTC is already the next day in Bratislava
    expect(calendarQuery(run('2026-10-20T23:30:00Z', null), now).on).toBe('2026-10-21');
  });

  it('builds the query of a link to the dialog: the day of a run, or only the id of an event without a date', () => {
    expect(eventLink(run('2026-11-02T00:00:00Z', '2026-11-07T00:00:00Z'), now)).toBe('?event=7&on=2026-11-02');
    expect(eventLink(run('2026-10-05T00:00:00Z', '2026-10-11T00:00:00Z'), now)).toBe('?event=7&on=2026-10-09');
    // an irregular event: dated like a run, waiting for a date (no `start` in the dialog, null from the API)
    expect(eventLink({ id: 12, start: '2026-10-13T18:00:00Z' }, now)).toBe('?event=12&on=2026-10-13');
    expect(eventLink({ id: 12 }, now)).toBe('?event=12');
    expect(eventLink({ id: 12, start: null }, now)).toBe('?event=12');
  });

  it('accepts only real days', () => {
    expect(validDay('2026-11-30')).toBe('2026-11-30');
    for (const bad of [undefined, '', '2026-02-30', '2026-13-01', '30.11.2026', '2026-11-3', 'x']) {
      expect(validDay(bad)).toBeNull();
    }
  });

  it('knows the days a run takes place on, to its exact end', () => {
    const mge = run('2026-10-05T00:00:00Z', '2026-10-11T00:00:00Z'); // ends at 02:00 on Sunday here
    expect(runsOn(mge, '2026-10-05')).toBe(true);
    expect(runsOn(mge, '2026-10-11')).toBe(true);
    expect(runsOn(mge, '2026-10-12')).toBe(false);
    expect(runsOn(mge, '2026-10-04')).toBe(false);
    expect(runsOn(run('2026-10-13T18:00:00Z', null), '2026-10-13')).toBe(true);
  });
});

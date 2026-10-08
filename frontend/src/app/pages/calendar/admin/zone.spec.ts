import { durationMinutes, kindOf } from './event-editor';
import { KINGDOM_ZONE, shiftDate, toInstant, wallClock } from './zone';

describe('event times for superusers', () => {
  it('our time follows daylight saving, UTC does not', () => {
    // summer time until Sunday 25 October 2026, 03:00
    expect(toInstant('2026-10-24', '20:00', KINGDOM_ZONE)).toBe('2026-10-24T18:00:00Z');
    expect(toInstant('2026-10-25', '20:00', KINGDOM_ZONE)).toBe('2026-10-25T19:00:00Z');
    expect(toInstant('2026-10-05', '00:00', 'UTC')).toBe('2026-10-05T00:00:00Z');
    expect(wallClock('2026-10-25T19:00:00Z', KINGDOM_ZONE)).toEqual({
      date: '2026-10-25',
      time: '20:00',
    });
    expect(wallClock('2026-10-05T00:00:00Z', KINGDOM_ZONE)).toEqual({
      date: '2026-10-05',
      time: '02:00',
    });
  });

  it('refuses dates and times that do not exist', () => {
    for (const [date, time] of [
      ['2026-02-30', '20:00'],
      ['2026-10-24', '24:00'],
      ['', '20:00'],
      ['2026-10-24', ''],
      ['24. 10. 2026', '20:00'],
    ]) {
      expect(toInstant(date, time, KINGDOM_ZONE)).toBeNull();
    }
  });

  it('days, durations and the kind of repeat', () => {
    expect(shiftDate('2026-10-01', -2)).toBe('2026-09-29');
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(durationMinutes('7', '', '')).toBe(10080);
    expect(durationMinutes('', '1', '30')).toBe(90);
    expect(durationMinutes('', '', '')).toBe(0);
    expect(durationMinutes('1.5', '', '')).toBeNull();
    expect(durationMinutes('', '-1', '')).toBeNull();
    expect(kindOf(null)).toBe('once');
  });
});

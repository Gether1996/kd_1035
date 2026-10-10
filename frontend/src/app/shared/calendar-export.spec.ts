import { googleUrl, utcStamp } from './calendar-export';

describe('calendar export', () => {
  const ark = {
    name: 'Ark of Osiris',
    start: '2026-10-14T00:00:00Z',
    end: '2026-10-19T00:00:00Z',
    details: 'https://kd1035.eu/kalendar?event=7&on=2026-10-14',
  };

  it('writes UTC stamps without separators', () => {
    expect(utcStamp(new Date('2026-10-14T20:05:09.123Z'))).toBe('20261014T200509Z');
  });

  it('prefills Google Calendar with the exact UTC run', () => {
    const url = new URL(googleUrl(ark));
    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(url.searchParams.get('action')).toBe('TEMPLATE');
    expect(url.searchParams.get('text')).toBe('Ark of Osiris');
    expect(url.searchParams.get('dates')).toBe('20261014T000000Z/20261019T000000Z');
    expect(url.searchParams.get('details')).toBe(ark.details);
  });

  it('gives an event without an end one hour and encodes the text', () => {
    const url = new URL(googleUrl({ ...ark, name: 'MGE – Lučištníci & spol.', end: null }));
    expect(url.searchParams.get('dates')).toBe('20261014T000000Z/20261014T010000Z');
    expect(url.searchParams.get('text')).toBe('MGE – Lučištníci & spol.');
    expect(googleUrl(ark)).not.toContain(' ');
  });
});

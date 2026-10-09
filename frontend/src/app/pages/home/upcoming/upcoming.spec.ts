import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { EventCalendar, Occurrence } from '../../../core/events-api';
import { Upcoming } from './upcoming';

const run = (id: number, name: string, start: string, end: string | null, extra: Partial<Occurrence> = {}) => ({
  id,
  name_sk: name,
  name_cs: '',
  icon: null,
  offered: [],
  guide: null,
  start,
  end,
  repeat_days: 14,
  irregular: false,
  ...extra,
});
// Friday 30 October 2026 noon; the 14 days end in November
const MGE = run(2, 'MGE – Jazda', '2026-10-26T00:00:00Z', '2026-11-01T00:00:00Z', { repeat_days: 56 });
const DAILY = run(4, 'Barbarian Fort', '2026-10-30T18:00:00Z', '2026-10-30T19:00:00Z', { repeat_days: 1 });
const SILK_ROAD = run(11, 'Silk Road', '2026-10-31T18:00:00Z', '2026-10-31T19:00:00Z', {
  repeat_days: 0,
  irregular: true,
});
const OVER = run(6, 'Wheel of Fortune', '2026-10-27T00:00:00Z', '2026-10-30T00:00:00Z');
const ARK = run(5, 'Ark of Osiris', '2026-11-02T00:00:00Z', '2026-11-07T00:00:00Z');
const LATER = run(8, 'Hunt for History', '2026-11-06T00:00:00Z', '2026-11-08T00:00:00Z');
const DATA: EventCalendar = {
  from: '2026-10-30',
  to: '2026-11-13',
  occurrences: [OVER, MGE, DAILY, SILK_ROAD, ARK, LATER],
  irregular: [],
};

describe('Upcoming (home)', () => {
  let fixture: ComponentFixture<Upcoming>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;
  const cards = () => [...el().querySelectorAll<HTMLAnchorElement>('.card')];

  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-10-30T12:00:00Z'), toFake: ['Date'] });
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        unobserve() {}
      },
    );
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function render(data: EventCalendar | 'error') {
    fixture = TestBed.createComponent(Upcoming);
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve)); // today is known after the first render, in the browser
    TestBed.tick();
    expect(el().querySelector('section')).toBeNull(); // nothing while loading – no empty box
    const req = http.expectOne((r) => r.url === '/api/events/');
    // today and 14 days on, here into the next month
    expect(req.request.params.get('from')).toBe('2026-10-30');
    expect(req.request.params.get('to')).toBe('2026-11-13');
    if (data === 'error') req.flush('down', { status: 502, statusText: 'Bad Gateway' });
    else req.flush(data);
    await fixture.whenStable();
  }

  it('shows the next three runs without the daily and the finished ones', async () => {
    await render(DATA);
    expect(cards().map((c) => c.querySelector('.card__name')?.textContent)).toEqual([
      'MGE – Jazda',
      'Silk Road',
      'Ark of Osiris',
    ]);
    const [mge, silk, ark] = cards();
    // running: the tag and the days only (game events start at 00:00 UTC); the night tail is left out like in the grid
    expect(mge.querySelector('.card__live')?.textContent).toContain('Prebieha');
    expect(mge.querySelector('.card__when')?.textContent?.trim()).toBe('po 26. 10. – so 31. 10.');
    // a short irregular event has its clock, in UTC too (the test runs in UTC)
    expect(silk.querySelector('.card__day')?.textContent).toBe('Zajtra');
    expect(silk.querySelector('.card__when')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('18:00 UTC 18:00');
    expect(ark.querySelector('.card__day')?.textContent).toBe('po 2. 11.');
    expect(ark.querySelector('.card__when small')).toBeNull();
  });

  it('links each card to its dialog in the calendar, on the day of the run', async () => {
    await render(DATA);
    expect(cards().map((c) => c.getAttribute('href'))).toEqual([
      '/kalendar?event=2&on=2026-10-30',
      '/kalendar?event=11&on=2026-10-31',
      '/kalendar?event=5&on=2026-11-02',
    ]);
    expect(el().querySelector('.more a')?.getAttribute('href')).toBe('/kalendar');
  });

  it('is not there with nothing coming up', async () => {
    await render({ ...DATA, occurrences: [OVER, DAILY] });
    expect(el().querySelector('section')).toBeNull();
  });

  it('is not there when the API fails', async () => {
    await render('error');
    expect(el().querySelector('section')).toBeNull();
  });
});

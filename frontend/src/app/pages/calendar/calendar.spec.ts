import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Me } from '../../core/auth';
import { EventCalendar } from '../../core/events-api';
import { ReminderSettings } from '../../core/reminders-api';
import { Scroll } from '../../core/scroll';
import { Calendar } from './calendar';

const MGE = {
  id: 2,
  name_sk: 'MGE – Jazda',
  name_cs: 'MGE – Jízda',
  icon: '/static/kingdom/events/mge.webp',
  offered: [60, 1440],
  guide: { category: 'eventy' as const, slug: 'mge', title_sk: 'Mightiest Governor', title_cs: '' },
  start: '2026-10-05T00:00:00Z',
  end: '2026-10-11T00:00:00Z',
  repeat_days: 56,
  irregular: false,
};
const SILK_ROAD = {
  id: 11,
  name_sk: 'Silk Road',
  name_cs: '',
  icon: null,
  offered: [15, 60],
  guide: null,
  start: '2026-10-13T18:00:00Z',
  end: '2026-10-13T19:00:00Z',
  repeat_days: 0,
  irregular: true,
};
const DATA: EventCalendar = {
  from: '2026-09-27',
  to: '2026-11-02',
  occurrences: [MGE, SILK_ROAD],
  // the next date first, then those without one
  irregular: [
    { ...SILK_ROAD, start: SILK_ROAD.start, end: SILK_ROAD.end },
    {
      id: 12,
      name_sk: 'Shadow Legion',
      name_cs: '',
      icon: null,
      offered: [15, 60],
      guide: null,
      start: null,
      end: null,
    },
  ],
};
const PLAYER: Me = {
  login_enabled: true,
  user: {
    discord_id: '1',
    name: 'Nelly',
    avatar_url: '',
    ingame_name: '',
    is_staff: false,
    is_superuser: false,
  },
};
const SETTINGS: ReminderSettings = {
  discord: false,
  discord_available: true,
  lang: 'sk',
  last_delivery: null,
  events: [
    {
      id: 11,
      name_sk: 'Silk Road',
      name_cs: '',
      icon: null,
      next_start: SILK_ROAD.start,
      repeat_days: 0,
      duration_minutes: 60,
      irregular: true,
      offered: [15, 60],
      offsets: null,
    },
  ],
};

describe('Calendar', () => {
  let fixture: ComponentFixture<Calendar>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;
  const dialog = () => el().querySelector('app-event-dialog');
  const bar = (name: string) =>
    [...el().querySelectorAll<HTMLButtonElement>('.bar')].find((b) =>
      b.textContent?.includes(name),
    )!;

  beforeEach(() => {
    // Thursday 8 October 2026 (only Date is faked – timers and promises run normally)
    vi.useFakeTimers({ now: new Date('2026-10-08T12:00:00Z'), toFake: ['Date'] });
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        // no parallax in the page header
        {
          provide: Scroll,
          useValue: { scrolled: signal(false), reducedMotion: true, onFrame: () => () => {} },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  /** lets an answered request reach its resource (a microtask), then renders */
  async function settle() {
    await new Promise((resolve) => setTimeout(resolve));
    TestBed.tick();
  }

  // whenStable() would wait for the open requests, so they are answered first
  async function render(
    me: Me,
    data: EventCalendar | 'error' = DATA,
    { query = {}, range = ['2026-09-27', '2026-11-02'] }: { query?: Record<string, string>; range?: string[] } = {},
  ) {
    fixture = TestBed.createComponent(Calendar);
    for (const [name, value] of Object.entries(query)) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
    http.expectOne('/api/auth/me/').flush(me);
    await settle(); // the month is set after the first render, in the browser
    // a signed-in player's reminders are asked as soon as the player is known
    if (me.user) http.expectOne('/api/me/reminders/').flush(SETTINGS);
    const events = http.expectOne((req) => req.url === '/api/events/');
    // the month grid in whole weeks and a day more on each side
    expect(events.request.params.get('from')).toBe(range[0]);
    expect(events.request.params.get('to')).toBe(range[1]);
    if (data === 'error') events.flush('down', { status: 502, statusText: 'Bad Gateway' });
    else events.flush(data);
    await fixture.whenStable();
  }

  async function open(button: HTMLElement) {
    button.click();
    await fixture.whenStable();
    expect(dialog()).not.toBeNull();
  }

  it('has no start time for an irregular event that runs for days', async () => {
    const mobilization = {
      ...SILK_ROAD,
      id: 13,
      name_sk: 'Alliance Mobilization',
      start: '2026-10-19T00:00:00Z',
      end: '2026-10-26T00:00:00Z',
    };
    await render(
      { login_enabled: false, user: null },
      { ...DATA, occurrences: [MGE, SILK_ROAD, mobilization] },
    );
    expect(bar('Alliance Mobilization').querySelector('.bar__time')).toBeNull();
    expect(bar('Silk Road').querySelector('.bar__time')).not.toBeNull();
  });

  it('shows the month with today, running events and the irregular ones', async () => {
    await render({ login_enabled: false, user: null });
    expect(el().querySelector('.toolbar__title')?.textContent).toContain('október 2026');
    expect(el().querySelector('.day.is-today .day__num')?.textContent?.trim()).toBe('8');
    expect(el().querySelectorAll('.bar').length).toBe(2);
    expect(bar('MGE').querySelector('.bar__live')).not.toBeNull(); // running now
    expect(bar('Silk Road').querySelector('.bar__live')).toBeNull();
    // the start time only for irregular events (recurring game events start at 00:00 UTC)
    expect(bar('Silk Road').querySelector('.bar__time')?.textContent).toBe('18:00'); // the test runs in UTC
    expect(bar('MGE').querySelector('.bar__time')).toBeNull();
    expect(el().querySelector('.strip--irregular')?.textContent).toContain('Shadow Legion');
    // phones: from today on, the running event under "Dnes"
    const days = [...el().querySelectorAll('.agenda__day')];
    expect(days.map((d) => d.querySelector('.agenda__rel')?.textContent ?? '')).toEqual([
      'Dnes',
      '',
    ]);
    expect(days[0].textContent).toContain('Prebieha');
    expect(days[0].querySelector('.row--untimed')).not.toBeNull(); // MGE
    expect(days[0].querySelector('.row__time')).toBeNull();
    expect(days[1].querySelector('.row__time')?.textContent).toContain('18:00');
  });

  it('the dialog shows the details and, with login on, a Discord login back to the same event', async () => {
    await render({ login_enabled: true, user: null });
    await open(bar('MGE'));
    const text = dialog()!.textContent ?? '';
    expect(text).toContain('MGE – Jazda');
    expect(text).toContain('každých 8 týždňov');
    expect(text).toContain('Prebieha');
    expect(text).toContain('UTC 5. 10. 00:00 – 11. 10. 00:00');
    expect(dialog()!.querySelector('.guide')?.getAttribute('href')).toBe('/navody/eventy/mge');
    const login = dialog()!.querySelector('.remind__login');
    expect(login?.getAttribute('href')).toBe(
      '/api/auth/discord/login/?next=%2Fkalendar%3Fevent%3D2%26on%3D2026-10-08',
    );
    expect(dialog()!.querySelector('.switch')).toBeNull();
    // into the visitor's own calendar: Google prefilled with the exact UTC run, the .ics file of its first day
    const [google, ics] = dialog()!.querySelectorAll<HTMLAnchorElement>('.export a');
    const params = new URL(google.href).searchParams;
    expect(params.get('dates')).toBe('20261005T000000Z/20261011T000000Z');
    expect(params.get('text')).toBe('MGE – Jazda');
    expect(params.get('details')).toContain('/kalendar?event=2&on=2026-10-08');
    expect(google.target).toBe('_blank');
    expect(ics.getAttribute('href')).toBe('/api/events/2/ics?on=2026-10-05');
    expect(ics.hasAttribute('download')).toBe(true);

    dialog()!.querySelector<HTMLButtonElement>('.modal__close')!.click();
    await fixture.whenStable();
    expect(dialog()).toBeNull();
  });

  it('a signed-in player sets the reminders right in the dialog', async () => {
    await render(PLAYER);
    await open(bar('Silk Road'));
    // the bot's messages are switched off → the warning with a link to the reminders page
    const note = dialog()!.querySelector('.remind__note');
    expect(note?.classList).toContain('is-warning');
    expect(note?.querySelector('a')?.getAttribute('href')).toBe('/pripomienky');

    dialog()!.querySelector<HTMLInputElement>('.switch')!.click();
    const put = http.expectOne('/api/me/reminders/11/');
    expect(put.request.body).toEqual({ offsets: [15] });
    put.flush({ ...SETTINGS.events[0], offsets: [15] });
    await fixture.whenStable();

    // closed and opened again: the choice is still there
    dialog()!.querySelector<HTMLButtonElement>('.modal__close')!.click();
    await fixture.whenStable();
    await open(bar('Silk Road'));
    expect(dialog()!.querySelector<HTMLInputElement>('.switch')!.checked).toBe(true);

    // an event that will not run again has nothing to pick
    dialog()!.querySelector<HTMLButtonElement>('.modal__close')!.click();
    await fixture.whenStable();
    await open(bar('MGE'));
    expect(dialog()!.querySelector('.switch')).toBeNull();
    expect(dialog()!.textContent).toContain('nebude opakovať');
  });

  it('an irregular event without a date opens too; login off = no reminders part', async () => {
    await render({ login_enabled: false, user: null });
    const pills = el().querySelectorAll<HTMLButtonElement>('.strip--irregular .pill-event');
    // every irregular event with its date: Silk Road on Tuesday evening, Shadow Legion not dated yet
    expect([...pills].map((p) => p.querySelector('.pill-event__when')?.textContent?.trim())).toEqual([
      'ut 13. 10. 18:00',
      'termín oznámime',
    ]);
    await open(pills[1]);
    expect(dialog()!.textContent).toContain('Ďalší termín oznámime.');
    expect(dialog()!.textContent).toContain('nepravidelne');
    expect(dialog()!.querySelector('.remind')).toBeNull();
    expect(dialog()!.querySelector('.export')).toBeNull();
  });

  it('a link with ?event= and ?on= opens that month and the run on that day, then drops both', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    // MGE again in November: the link from the home page names the day of the run
    const november = { ...MGE, start: '2026-11-30T00:00:00Z', end: '2026-12-06T00:00:00Z' };
    await render(
      { login_enabled: false, user: null },
      { ...DATA, from: '2026-10-25', to: '2026-12-07', occurrences: [november], irregular: [] },
      { query: { event: '2', on: '2026-11-30' }, range: ['2026-10-25', '2026-12-07'] },
    );
    expect(el().querySelector('.toolbar__title')?.textContent).toContain('november 2026');
    expect(dialog()?.textContent).toContain('30. 11.');
    expect(navigate).toHaveBeenCalledWith([], {
      queryParams: { event: null, on: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  });

  it('a bad ?on= is ignored: the current month, and the event still opens', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await render({ login_enabled: false, user: null }, DATA, { query: { event: '11', on: '2026-02-30' } });
    expect(el().querySelector('.toolbar__title')?.textContent).toContain('október 2026');
    expect(dialog()?.textContent).toContain('Silk Road');
    expect(navigate.mock.calls[0][1]?.queryParams).toEqual({ event: null, on: null });
  });

  it('says when the month has no events', async () => {
    await render(
      { login_enabled: false, user: null },
      { ...DATA, occurrences: [], irregular: [] },
    );
    expect(el().querySelector('.state')?.textContent).toContain(
      'Zatiaľ nie sú naplánované žiadne eventy.',
    );
    expect(el().querySelector('.strip')).toBeNull();
  });

  it('a failed API shows a short note instead of the grid', async () => {
    await render({ login_enabled: false, user: null }, 'error');
    expect(el().querySelector('.state')?.textContent).toContain('Kalendár sa nepodarilo načítať');
    expect(el().querySelector('.month')).toBeNull();
  });

  it('a superuser gets "+" on today and the days after it, players do not', async () => {
    fixture = TestBed.createComponent(Calendar);
    fixture.detectChanges();
    http
      .expectOne('/api/auth/me/')
      .flush({ ...PLAYER, user: { ...PLAYER.user!, is_superuser: true } });
    await settle();
    http.expectOne('/api/me/reminders/').flush(SETTINGS);
    http
      .expectOne('/api/events/manage/')
      .flush({ events: [], icons: [], guides: [], reminder_choices: [60], webhook: false });
    http.expectOne((req) => req.url === '/api/events/').flush(DATA);
    await fixture.whenStable();
    const adds = [...el().querySelectorAll<HTMLButtonElement>('.day__add')];
    // 8 – 31 October and Sunday 1 November
    expect(adds.length).toBe(25);
    expect(adds[0].getAttribute('aria-label')).toBe('Pridať event – štvrtok 8. októbra');
  });

  it('a player sees no "+" and the event management is not asked for', async () => {
    await render(PLAYER);
    expect(el().querySelector('.day__add')).toBeNull();
    expect(el().querySelector('app-events-panel')).toBeNull();
  });
});

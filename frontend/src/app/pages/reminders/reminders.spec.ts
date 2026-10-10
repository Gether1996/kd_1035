import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { KingdomApi } from '../../core/api';
import { ReminderEvent, ReminderSettings } from '../../core/reminders-api';
import { monogram } from '../../shared/event-icon';
import { EVENING_BEFORE } from './format';
import { Reminders } from './reminders';

const event = (id: number, changes: Partial<ReminderEvent>): ReminderEvent => ({
  id,
  name_sk: 'Ruiny',
  name_cs: '',
  icon: null,
  next_start: '2026-10-10T18:00:00Z',
  running_until: null,
  repeat_days: 7,
  duration_minutes: 2880,
  irregular: false,
  offered: [10, 60],
  offsets: null,
  ...changes,
});

const SETTINGS: ReminderSettings = {
  discord: true,
  discord_available: true,
  lang: 'sk',
  last_delivery: null,
  events: [
    event(1, {
      name_sk: '20 GH',
      icon: '/static/kingdom/events/gold-head.webp',
      offsets: [1800, EVENING_BEFORE, 60],
    }),
    event(2, { name_sk: 'MGE – Pěchota', repeat_days: 56 }),
    event(3, {
      name_sk: 'Silk Road',
      next_start: null,
      running_until: null,
      repeat_days: 0,
      irregular: true,
      offsets: [0, 15],
    }),
  ],
};

describe('Reminders on /pripomienky', () => {
  let http: HttpTestingController;

  async function render(settings: ReminderSettings = SETTINGS) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '**', children: [] }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        // the kingdom's Discord invite (/api/links/)
        {
          provide: KingdomApi,
          useValue: { links: signal({ discord: 'https://discord.gg/kd1035' }) },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(Reminders);
    fixture.detectChanges(); // the settings are asked in the first change detection
    http.expectOne('/api/me/reminders/').flush(settings);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const mine = (el: HTMLElement) => [...el.querySelectorAll('.mine__row')];
  const tiles = (el: HTMLElement) => [...el.querySelectorAll<HTMLButtonElement>('.tile')];

  afterEach(() => http.verify());

  it('"Moje pripomienky" is one short line per event: what, when, how long before', async () => {
    const { el } = await render();
    const rows = mine(el);
    expect(rows.map((row) => text(row.querySelector('.mine__name')))).toEqual([
      '20 GH',
      'Silk Road',
    ]);
    expect(text(rows[0].querySelector('.mine__times'))).toBe('deň vopred o 18:00 · 1 deň 6 h · 1 h vopred');
    // a game event: the day says enough, no clock
    expect(text(rows[0].querySelector('.mine__when'))).toBe('so 10. 10.');
    expect(text(rows[1].querySelector('.mine__times'))).toBe('15 min vopred · pri začiatku');
    expect(text(rows[1].querySelector('.mine__when'))).toBe('termín oznámime');
    // game art where there is some, a monogram otherwise
    expect(rows[0].querySelector('app-event-icon img')?.getAttribute('src')).toBe(
      '/static/kingdom/events/gold-head.webp',
    );
    expect(text(rows[1].querySelector('app-event-icon'))).toBe('SR');
    expect(text(el.querySelector('#mine-title .group__count'))).toBe('2');
  });

  it('an irregular event running now says so instead of "termín oznámime", like the calendar', async () => {
    const running = event(4, {
      name_sk: 'Alliance Mobilization',
      next_start: null,
      running_until: '2026-10-12T09:00:00Z',
      repeat_days: 0,
      irregular: true,
      offsets: [EVENING_BEFORE],
    });
    const { el } = await render({ ...SETTINGS, events: [running] });
    expect(text(mine(el)[0].querySelector('.mine__when'))).toBe('Prebieha · do po 12. 10.');
  });

  it('the clock only for a short irregular event, not for one running for days', async () => {
    const dated = (id: number, duration_minutes: number) =>
      event(id, { irregular: true, repeat_days: 0, duration_minutes, offsets: [15] });
    const { el } = await render({ ...SETTINGS, events: [dated(1, 60), dated(2, 10080)] });
    const when = mine(el).map((row) => text(row.querySelector('.mine__when')));
    expect(when[0]).toMatch(/^so 10\. 10\. \d\d:00 · UTC 18:00$/); // Silk Road in the evening
    expect(when[1]).toBe('so 10. 10.'); // Alliance Mobilization, a whole week
  });

  it('all events are tiles that say what a click does, irregular ones first', async () => {
    const { el } = await render();
    expect(tiles(el).map((tile) => text(tile.querySelector('.tile__action')))).toEqual([
      '2 pripomienky',
      '3 pripomienky',
      'Nastaviť',
    ]);
    expect(tiles(el).map((tile) => tile.classList.contains('is-on'))).toEqual([true, true, false]);
    expect(text(tiles(el)[0].querySelector('.tile__repeat'))).toBe('nepravidelne');
    expect(text(tiles(el)[2].querySelector('.tile__repeat'))).toBe('každých 8 týždňov');
  });

  it('Zrušiť in the overview stops the reminders of the event', async () => {
    const { fixture, el } = await render();
    mine(el)[0].querySelector<HTMLButtonElement>('.icon-btn--stop')!.click();
    const req = http.expectOne('/api/me/reminders/1/');
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();
    expect(mine(el).map((row) => text(row.querySelector('.mine__name')))).toEqual(['Silk Road']);
    expect(text(tiles(el)[1].querySelector('.tile__action'))).toBe('Nastaviť');
  });

  it('a tile opens the times in a dialog; a change shows in the overview at once', async () => {
    const { fixture, el } = await render();
    tiles(el)[2].click();
    await fixture.whenStable();
    const dialog = el.querySelector('dialog')!;
    expect(text(dialog.querySelector('.modal__title'))).toBe('MGE – Pěchota');
    expect(dialog.querySelector('.remind__note')).toBeNull(); // no "set it up on Pripomienky eventov" – we are there
    dialog.querySelector<HTMLInputElement>('.switch')!.click();
    const put = http.expectOne('/api/me/reminders/2/');
    expect(put.request.body).toEqual({ offsets: [10] });
    put.flush(event(2, { offsets: [10] }));
    await fixture.whenStable();
    expect(mine(el).map((row) => text(row.querySelector('.mine__name')))).toEqual([
      '20 GH',
      'MGE – Pěchota',
      'Silk Road',
    ]);
    dialog.querySelector<HTMLButtonElement>('.modal__close')!.click();
    await fixture.whenStable();
    expect(el.querySelector('dialog')).toBeNull();
  });

  it('search ignores case and diacritics, the filter splits regular and irregular events', async () => {
    const { fixture, el } = await render();
    const search = el.querySelector<HTMLInputElement>('.tools__search input')!;
    search.value = 'PECHOTA';
    search.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(tiles(el).map((tile) => text(tile.querySelector('.tile__name')))).toEqual([
      'MGE – Pěchota',
    ]);
    search.value = '';
    search.dispatchEvent(new Event('input'));
    el.querySelectorAll<HTMLButtonElement>('.segmented button')[2].click();
    await fixture.whenStable();
    expect(tiles(el).map((tile) => text(tile.querySelector('.tile__name')))).toEqual(['Silk Road']);
  });

  it('one switch for the Discord messages from the bot; off warns the player', async () => {
    const { fixture, el } = await render();
    const toggle = el.querySelector<HTMLInputElement>('#remind-discord')!;
    expect(toggle.checked).toBe(true);
    expect(text(el.querySelector('.discord__state'))).toBe('Zapnuté');
    expect(el.querySelectorAll('.switch').length).toBe(1);
    toggle.click();
    const patch = http.expectOne('/api/me/reminders/');
    expect(patch.request.body).toEqual({ discord: false });
    patch.flush({});
    await fixture.whenStable();
    expect(text(el.querySelector('.discord__state'))).toBe('Vypnuté – pripomienky ti neprídu.');
    expect(el.querySelector('.discord.is-off')).not.toBeNull();
  });

  it('a test message says at once whether the bot can reach the player', async () => {
    const { fixture, el } = await render();
    const button = el.querySelector<HTMLButtonElement>('.discord__test')!;
    const result = el.querySelector('.discord__result')!;
    expect(result.getAttribute('role')).toBe('status');
    const answers: [object, number, string, boolean][] = [
      [{ ok: true }, 200, 'Správa odoslaná – pozri súkromné správy na Discorde.', false],
      [
        { ok: false, reason: 'blocked' },
        200,
        'Bot ti nevie napísať. Musíš byť na našom Discord serveri a mať zapnuté súkromné správy od členov servera. Pripojiť sa na Discord',
        true,
      ],
      [{ ok: false, reason: 'unavailable' }, 200, 'Discord teraz neodpovedá, skús neskôr.', false],
      [{ detail: 'Throttled' }, 429, 'Skús to o pár minút.', false],
    ];
    for (const [body, status, said, join] of answers) {
      expect(button.disabled).toBe(false);
      button.click();
      await fixture.whenStable();
      expect(button.getAttribute('aria-disabled')).toBe('true'); // while sending, keeps the focus
      button.click(); // a second click sends nothing
      http.expectOne('/api/me/reminders/test/').flush(body, { status, statusText: String(status) });
      await new Promise((done) => setTimeout(done)); // the answer passes through two awaits
      await fixture.whenStable();
      expect(text(result)).toBe(said);
      expect(result.querySelector('a.join')?.getAttribute('href') ?? null).toBe(
        join ? 'https://discord.gg/kd1035' : null,
      );
    }
  });

  it('the test button is off while the bot is not set up', async () => {
    const { el } = await render({ ...SETTINGS, discord_available: false });
    expect(el.querySelector<HTMLButtonElement>('.discord__test')!.disabled).toBe(true);
  });

  it('a reminder that did not arrive is explained until a test gets through', async () => {
    const failed = { ok: false, blocked: true, at: '2026-10-07T18:00:00Z' };
    const { fixture, el } = await render({ ...SETTINGS, last_delivery: failed });
    const warning = () => el.querySelector('.delivery');
    expect(text(warning()?.querySelector('.delivery__title') ?? null)).toMatch(
      /^Posledná pripomienka ti neprišla \(7\. 10\. \d\d:00\)\.$/,
    );
    expect(text(warning()?.querySelector('.delivery__text') ?? null)).toContain(
      'Bot ti nevie napísať.',
    );
    expect(warning()?.querySelector('a.join')?.getAttribute('href')).toBe(
      'https://discord.gg/kd1035',
    );

    // a failed test changes nothing, a test that arrives hides the old failure for this visit
    el.querySelector<HTMLButtonElement>('.discord__test')!.click();
    http.expectOne('/api/me/reminders/test/').flush({ ok: false, reason: 'unavailable' });
    await fixture.whenStable();
    expect(warning()).not.toBeNull();
    el.querySelector<HTMLButtonElement>('.discord__test')!.click();
    http.expectOne('/api/me/reminders/test/').flush({ ok: true });
    await fixture.whenStable();
    expect(warning()).toBeNull();
  });

  it('no warning after a delivered reminder, for other errors a hint to test', async () => {
    const at = '2026-10-07T18:00:00Z';
    let { el } = await render({ ...SETTINGS, last_delivery: { ok: true, blocked: false, at } });
    expect(el.querySelector('.delivery')).toBeNull();
    TestBed.resetTestingModule();
    ({ el } = await render({ ...SETTINGS, last_delivery: { ok: false, blocked: false, at } }));
    expect(text(el.querySelector('.delivery__text'))).toBe(
      'Discord ju neprijal. Pošli si skúšobnú správu a uvidíš, či to už funguje.',
    );
    expect(el.querySelector('.delivery a.join')).toBeNull();
  });

  it('no stale warning when the player switched the messages off', async () => {
    const last_delivery = { ok: false, blocked: true, at: '2026-10-07T18:00:00Z' };
    const { el } = await render({ ...SETTINGS, discord: false, last_delivery });
    expect(el.querySelector('.delivery')).toBeNull();
  });

  it('without any reminder the player sees how it works', async () => {
    const { el } = await render({
      ...SETTINGS,
      events: SETTINGS.events.map((e) => ({ ...e, offsets: null })),
    });
    expect(mine(el).length).toBe(0);
    expect(el.querySelectorAll('.steps__item').length).toBe(3);
  });

  it('monograms for events without game art', () => {
    expect(
      [
        'Silk Road',
        'Shadow Legion',
        'Alliance Mobilization',
        '20 GH',
        'Hunt for History (vajce)',
        '',
      ].map(monogram),
    ).toEqual(['SR', 'SL', 'AM', '20', 'HF', '?']);
  });
});

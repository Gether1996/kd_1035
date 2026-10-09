import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ReminderEvent, ReminderSettings } from '../../core/reminders-api';
import { monogram } from '../../shared/event-icon';
import { Reminders, plain } from './reminders';

const event = (id: number, changes: Partial<ReminderEvent>): ReminderEvent => ({
  id,
  name_sk: 'Ruiny',
  name_cs: '',
  icon: null,
  next_start: '2026-10-10T18:00:00Z',
  repeat_days: 7,
  irregular: false,
  offered: [10, 60],
  offsets: null,
  ...changes,
});

const SETTINGS: ReminderSettings = {
  discord: true,
  discord_available: true,
  lang: 'sk',
  events: [
    event(1, {
      name_sk: '20 GH',
      icon: '/static/kingdom/events/gold-head.webp',
      offsets: [1800, 60],
    }),
    event(2, { name_sk: 'MGE – Pěchota', repeat_days: 56 }),
    event(3, {
      name_sk: 'Silk Road',
      next_start: null,
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
    expect(text(rows[0].querySelector('.mine__times'))).toBe('1 deň 6 h · 1 h vopred');
    expect(text(rows[0].querySelector('.mine__when'))).toMatch(
      /^so 10\. 10\. \d\d:00 · UTC 18:00$/,
    );
    expect(text(rows[1].querySelector('.mine__times'))).toBe('15 min vopred · pri začiatku');
    expect(text(rows[1].querySelector('.mine__when'))).toBe('termín oznámime');
    // game art where there is some, a monogram otherwise
    expect(rows[0].querySelector('app-event-icon img')?.getAttribute('src')).toBe(
      '/static/kingdom/events/gold-head.webp',
    );
    expect(text(rows[1].querySelector('app-event-icon'))).toBe('SR');
    expect(text(el.querySelector('#mine-title .group__count'))).toBe('2');
  });

  it('all events are tiles that say what a click does, irregular ones first', async () => {
    const { el } = await render();
    expect(tiles(el).map((tile) => text(tile.querySelector('.tile__action')))).toEqual([
      '2 pripomienky',
      '2 pripomienky',
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
    expect(plain('  MGE – Pěchota ')).toBe('mge – pechota');
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

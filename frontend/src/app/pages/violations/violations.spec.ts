import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { ViolationData, ViolationPlayer, levelOf, nextLevel } from './violations-api';
import { Violations } from './violations';

const LEVELS = [
  { name: 'Žltá karta', penalty: 'Varovanie', days: 0 },
  { name: '2. žltá karta', penalty: 'Bez MGE', days: 14 },
  { name: 'Červená karta', penalty: 'Bez eventov', days: 30 },
];
const card = (id: number, day: string, level: number) => ({ id, day, reason: 'MGE', level, added_by: 'Methiu', created_at: '' });
const tick = async (fixture: { detectChanges(): void }) => {
  for (let i = 0; i < 3; i++) await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
};
const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

describe('violations – the level of the next card (the server counts the same, accounts/violations.py)', () => {
  it('goes a level up within the window, a longer gap starts again', () => {
    expect(nextLevel([], '2026-11-18', 60)).toBe(1);
    expect(nextLevel([card(1, '2026-10-01', 1)], '2026-11-18', 60)).toBe(2);
    expect(nextLevel([card(1, '2026-08-01', 1)], '2026-11-18', 60)).toBe(1);
    expect(nextLevel([card(2, '2026-11-01', 2), card(1, '2026-10-01', 1)], '2026-11-18', 60)).toBe(3);
    // a card later than the new one does not count before it
    expect(nextLevel([card(1, '2026-11-20', 1)], '2026-11-18', 60)).toBe(1);
    expect(levelOf(LEVELS, 5)?.name).toBe('Červená karta');
    expect(levelOf(LEVELS, 0)).toBeNull();
  });
});

describe('Violations – /priestupky (Gether 18. 11. 2026)', () => {
  const nelly: ViolationPlayer = {
    id: 1,
    name: 'Nelly',
    avatar_url: '/a.png',
    level: 2,
    active_until: '2027-01-15',
    penalty_until: '2026-11-30',
    cards: [card(11, '2026-11-16', 2), card(10, '2026-10-01', 1)],
  };
  const bob: ViolationPlayer = { id: 2, name: 'Bob', avatar_url: '/b.png', level: 0, active_until: null, penalty_until: null, cards: [] };
  const data: ViolationData = { rules: { window_days: 60, keep_days: 365, levels: LEVELS }, players: [bob, nelly], edit_rules: false };

  async function render() {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), { provide: PLATFORM_ID, useValue: 'browser' }],
    });
    const fixture = TestBed.createComponent(Violations);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/violations/').flush(data);
    await tick(fixture);
    return { fixture, http, el: fixture.nativeElement as HTMLElement };
  }

  it('the rules, and the players with a valid card by default', async () => {
    const { el, fixture } = await render();
    expect(text(el.querySelector('.rules__summary'))).toContain('Ďalšia karta do 60 dní od predošlej zvýši stupeň.');
    expect(Array.from(el.querySelectorAll('.level__name'), text)).toEqual(['Žltá karta', '2. žltá karta', 'Červená karta']);
    // only the superadmin edits them
    expect(el.querySelector('.rules .pill-btn')).toBeNull();
    const rows = () => Array.from(el.querySelectorAll('.row__name'), text);
    expect(rows()).toEqual(['Nelly']);
    expect(Array.from(el.querySelectorAll('.row__state > span'), text)).toEqual([
      '2. žltá karta',
      'platí do 15. 1. 2027',
      'trest do 30. 11. 2026',
    ]);
    el.querySelectorAll<HTMLButtonElement>('.segmented button')[2].click();
    fixture.detectChanges();
    expect(rows()).toEqual(['Bob', 'Nelly']);
  });

  it('adds a card with the level it will get, deletes one on the second click', async () => {
    const { el, fixture, http } = await render();
    const select = el.querySelector<HTMLSelectElement>('.add select')!;
    select.value = '1';
    select.dispatchEvent(new Event('change'));
    const day = el.querySelector<HTMLInputElement>('.add input[type="date"]')!;
    day.value = '2026-11-17';
    day.dispatchEvent(new Event('input'));
    const reason = el.querySelector<HTMLInputElement>('.add__reason input')!;
    reason.value = ' Prestrelil MGE ';
    reason.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(text(el.querySelector('.add__preview'))).toBe('Bude to 3. stupeň: Červená karta – Bez eventov (30 dní)');
    el.querySelector<HTMLFormElement>('.add__form')!.dispatchEvent(new Event('submit'));
    const post = http.expectOne((r) => r.method === 'POST');
    expect(post.request.body).toEqual({ player: 1, day: '2026-11-17', reason: 'Prestrelil MGE' });
    post.flush({ ...nelly, level: 3, cards: [card(12, '2026-11-17', 3), ...nelly.cards] });
    await tick(fixture);
    expect(text(el.querySelector('.add .state-line'))).toBe('Priestupok je pridaný.');
    // the player's cards open after adding one
    expect(el.querySelectorAll('.card').length).toBe(3);

    const del = () => el.querySelector<HTMLButtonElement>('.card__delete')!;
    del().click();
    fixture.detectChanges();
    expect(text(del())).toBe('Naozaj zmazať?');
    http.expectNone((r) => r.method === 'DELETE');
    del().click();
    http.expectOne((r) => r.method === 'DELETE' && r.url === '/api/violations/12/').flush(nelly);
    await tick(fixture);
    expect(el.querySelectorAll('.card').length).toBe(2);
  });
});

import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ViolationBoard, ViolationData, ViolationPlayer, levelOf, nextLevel } from './violations-api';
import { Violations } from './violations';
import { ViolationsBoard } from './violations-board';

// Gether 18. 11. 2026: "prvý priestupok 1 týždeň kick z Ali, druhý kumulatívny 2 týždne, tretí zero"
const LEVELS = [
  { name: '1. strike', penalty: 'Kick z aliancie', days: 7 },
  { name: '2. strike', penalty: 'Kick z aliancie', days: 14 },
  { name: '3. strike', penalty: 'Zero', days: 0 },
];
const RULES = { reset_days: 30, keep_days: 365, description: '1. strike – týždeň kick z aliancie.', levels: LEVELS };
const card = (id: number, day: string, level: number) => ({ id, day, reason: 'MGE', level, added_by: 'Methiu', created_at: '' });
const tick = async (fixture: { detectChanges(): void }) => {
  for (let i = 0; i < 3; i++) await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
};
const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

function setup() {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), { provide: PLATFORM_ID, useValue: 'browser' }],
  });
  return TestBed.inject(HttpTestingController);
}

describe('violations – the strike of the next violation (the server counts the same, accounts/violations.py)', () => {
  it('the next strike until the penalty ended and the reset days passed, later the first again', () => {
    expect(nextLevel([], '2026-11-18', RULES)).toBe(1);
    // the 1st on 1. 10.: the kick until 8. 10., the next strike until 7. 11.
    expect(nextLevel([card(1, '2026-10-01', 1)], '2026-11-07', RULES)).toBe(2);
    expect(nextLevel([card(1, '2026-10-01', 1)], '2026-11-08', RULES)).toBe(1);
    expect(nextLevel([card(2, '2026-11-01', 2), card(1, '2026-10-20', 1)], '2026-11-18', RULES)).toBe(3);
    // a zero during a 2-week kick: the next strike counts from the end of the kick
    const kick = [card(3, '2026-11-15', 3), card(2, '2026-11-10', 2), card(1, '2026-10-25', 1)];
    expect(nextLevel(kick, '2026-12-23', RULES)).toBe(4);
    // a violation later than the new one does not count before it
    expect(nextLevel([card(1, '2026-11-20', 1)], '2026-11-18', RULES)).toBe(1);
    expect(levelOf(LEVELS, 5)?.name).toBe('3. strike');
    expect(levelOf(LEVELS, 0)).toBeNull();
  });
});

describe('ViolationsBoard – the Prehľad tab every approved player sees (Gether 18. 11. 2026)', () => {
  afterEach(() => vi.useRealTimers());

  it('the description, the strikes and who has one with the penalty counting down', async () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 18, 12, 0), toFake: ['Date'] });
    const http = setup();
    const fixture = TestBed.createComponent(ViolationsBoard);
    fixture.detectChanges();
    const board: ViolationBoard = {
      description: RULES.description,
      reset_days: 30,
      levels: LEVELS,
      manage: false,
      players: [
        { id: 2, name: 'Bob', avatar_url: '/b.png', level: 1, penalty_until: '2026-11-24', penalty: 'Kick z aliancie', reset_on: '2026-12-25' },
        { id: 1, name: 'Nelly', avatar_url: '/a.png', level: 3, penalty_until: null, penalty: '', reset_on: '2026-12-16' },
      ],
    };
    http.expectOne('/api/violations/board/').flush(board);
    await tick(fixture);
    const el = fixture.nativeElement as HTMLElement;
    expect(text(el.querySelector('.about__text'))).toBe('1. strike – týždeň kick z aliancie.');
    expect(text(el.querySelector('.about__reset'))).toBe(
      'Po skončení trestu sa počítadlo vynuluje, ak do 30 dní nepríde ďalší priestupok.',
    );
    expect(Array.from(el.querySelectorAll('.strike__name'), text)).toEqual(['1. strike', '2. strike', '3. strike']);
    const rows = Array.from(el.querySelectorAll('.row'));
    expect(rows.map((r) => text(r.querySelector('.row__name')))).toEqual(['Bob', 'Nelly']);
    // 18. 11. 12:00 → the end of 24. 11.: 6 days 12 hours
    expect(text(rows[0].querySelector('.row__left'))).toBe('Trest ešte 6 d 12 h');
    expect(text(rows[0].querySelector('.row__date'))).toBe('Kick z aliancie do 24. 11. 2026');
    expect(rows[0].querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Strike 1 z 3');
    expect(rows[0].querySelectorAll('.mark.is-on').length).toBe(1);
    // the zero: no time – the strike holds until the reset
    expect(text(rows[1].querySelector('.row__date'))).toBe('Bez trestu, strike platí do 15. 12. 2026');
    expect(rows[1].querySelectorAll('.mark.is-on').length).toBe(3);
  });
});

describe('Violations – the Správa tab (Gether 18. 11. 2026)', () => {
  const nelly: ViolationPlayer = {
    id: 1,
    name: 'Nelly',
    avatar_url: '/a.png',
    level: 2,
    penalty_until: '2026-11-30',
    penalty: 'Kick z aliancie',
    reset_on: '2026-12-31',
    cards: [card(11, '2026-11-16', 2), card(10, '2026-11-01', 1)],
  };
  const bob: ViolationPlayer = { id: 2, name: 'Bob', avatar_url: '/b.png', level: 0, penalty_until: null, penalty: '', reset_on: null, cards: [] };
  const data: ViolationData = { rules: RULES, players: [bob, nelly], edit_rules: false };

  async function render() {
    const http = setup();
    const fixture = TestBed.createComponent(Violations);
    fixture.detectChanges();
    http.expectOne('/api/violations/').flush(data);
    await tick(fixture);
    return { fixture, http, el: fixture.nativeElement as HTMLElement };
  }

  it('the rules with the description, and the players with a strike by default', async () => {
    const { el, fixture } = await render();
    expect(text(el.querySelector('.rules__description'))).toBe('1. strike – týždeň kick z aliancie.');
    expect(Array.from(el.querySelectorAll('.level__name'), text)).toEqual(['1. strike', '2. strike', '3. strike']);
    // only the superadmin edits them
    expect(el.querySelector('.rules .pill-btn')).toBeNull();
    const rows = () => Array.from(el.querySelectorAll('.row__name'), text);
    expect(rows()).toEqual(['Nelly']);
    expect(Array.from(el.querySelectorAll('.row__state > span'), text)).toEqual([
      '2. strike',
      'trest do 30. 11. 2026',
      'čistý od 31. 12. 2026',
    ]);
    el.querySelectorAll<HTMLButtonElement>('.segmented button')[2].click();
    fixture.detectChanges();
    expect(rows()).toEqual(['Bob', 'Nelly']);
  });

  it('adds a violation with the strike it will get, deletes one on the second click', async () => {
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
    expect(text(el.querySelector('.add__preview'))).toBe('Bude to 3. strike – Zero');
    el.querySelector<HTMLFormElement>('.add__form')!.dispatchEvent(new Event('submit'));
    const post = http.expectOne((r) => r.method === 'POST');
    expect(post.request.body).toEqual({ player: 1, day: '2026-11-17', reason: 'Prestrelil MGE' });
    post.flush({ ...nelly, level: 3, cards: [card(12, '2026-11-17', 3), ...nelly.cards] });
    await tick(fixture);
    expect(text(el.querySelector('.add .state-line'))).toBe('Priestupok je pridaný.');
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

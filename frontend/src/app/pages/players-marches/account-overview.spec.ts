import { PLATFORM_ID, signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { ARMORY } from '../../core/armory-testing';
import { Auth } from '../../core/auth';
import { March } from '../../core/kvk-api';
import { AccountOverview } from './account-overview';

const tick = async (fixture: { detectChanges(): void }) => {
  for (let i = 0; i < 3; i++) await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
};

const march = (id: number, position: number, change: Partial<March>): March => ({
  id,
  position,
  kind: 'cavalry',
  primary: 'Attila',
  secondary: 'Takeda Shingen',
  primary_skills: '5555',
  secondary_skills: '5511',
  ...change,
});

const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

function render(user: object, marches: March[] | 'error') {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: PLATFORM_ID, useValue: 'browser' },
      { provide: Auth, useValue: { user: signal(user) } },
    ],
  });
  const fixture = TestBed.createComponent(AccountOverview);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  return { fixture, http, el: fixture.nativeElement as HTMLElement, marches };
}

async function load({ fixture, http, marches }: ReturnType<typeof render>) {
  const own = http.expectOne('/api/me/marches/');
  if (marches === 'error') own.flush(null, { status: 500, statusText: 'Error' });
  else own.flush({ marches, max: 10, public: false });
  http.expectOne('/api/commanders/marches/').flush([{ name: 'Attila', icon: '/static/attila.webp', offered: true }]);
  http.match('/api/armory/').forEach((r) => r.flush(ARMORY));
  await tick(fixture);
}

const USER = {
  name: 'smrtak',
  ingame_name: 'Smrťák',
  avatar_url: '/a.png',
  approved: true,
  power: 115,
  vip: 18,
  kill_points: 8_800_000_000,
  highest_acclaim: 5_600_000,
  stats_updated_at: '2026-11-06T10:00:00Z',
};

describe('AccountOverview – "Prehľad účtu" on /marche (Gether 10. 11. 2026)', () => {
  it('the account on top: name, VIP, power, kill points, the highest acclaim and the day they were written down', async () => {
    const setup = render(USER, []);
    await load(setup);
    const { el } = setup;
    expect(text(el.querySelector('.ov-head__name'))).toBe('Smrťák VIP 18');
    expect(text(el.querySelector('.ov-head__discord'))).toBe('smrtak');
    const stat = (d: Element) => `${text(d.querySelector('dt'))} ${text(d.querySelector('dd'))}`;
    expect(Array.from(el.querySelectorAll('.ov-stats div'), stat)).toEqual(['Power 115M', 'Kill points 8.8B', 'Najvyšší acclaim 5.6M']);
    expect(text(el.querySelector('.ov-head__updated'))).toBe('Údaje z 6. 11. 2026 Upraviť údaje');
    expect(text(el.querySelector('.ov-state'))).toContain('Zatiaľ nemáš žiadny march');
  });

  it('nothing written down yet: dashes and where to write it', async () => {
    const setup = render({ ...USER, vip: null, kill_points: null, highest_acclaim: null, power: null, stats_updated_at: null }, []);
    await load(setup);
    const { el } = setup;
    expect(el.querySelector('.ov-vip')).toBeNull();
    expect(Array.from(el.querySelectorAll('.ov-stats dd'), (d) => text(d))).toEqual(['–', '–', '–']);
    expect(text(el.querySelector('.ov-head__updated'))).toContain('si zapíš na Môj účet');
  });

  it('every march as a column in its order: commanders, equipment, inscriptions gold first, formation, bonuses', async () => {
    const setup = render(USER, [
      march(2, 2, { kind: 'infantry', primary: 'Sun Tzu', secondary: '', primary_skills: '5511', attack: 9, damage: 0 }),
      march(1, 1, {
        gear: { weapon: { item: 'sacred-dominion', crit: true, iconic: 2 } },
        formation: 'delta',
        inscriptions: ['u-emblem-enduring', 'delta-emblem-relentless', 'delta-scroll-thrasher'],
        attack: 12,
        defense: 12.6,
        damage: 1.6,
      }),
    ]);
    await load(setup);
    const { el } = setup;
    const columns = Array.from(el.querySelectorAll('.ov-march'));
    expect(columns.length).toBe(2);
    expect(el.querySelector<HTMLElement>('.ov-marches')!.style.getPropertyValue('--count')).toBe('2');
    const [first, second] = columns;
    expect(text(first.querySelector('.ov-march__names'))).toBe('Attila Takeda Shingen 5511');
    expect(first.querySelector('.ov-expertise')).not.toBeNull();
    expect(first.querySelector<HTMLImageElement>('.ov-face')!.getAttribute('src')).toBe('/static/attila.webp');
    // the commander without a portrait: initials
    expect(text(first.querySelector('.ov-face--text'))).toBe('TS');
    expect(first.querySelector('app-gear-grid')).not.toBeNull();
    expect(Array.from(first.querySelectorAll('.ov-inscs .insc'), (i) => [text(i), i.className])).toEqual([
      ['Thrasher', 'insc insc--special'],
      ['Relentless', 'insc insc--rare'],
      ['Enduring', 'insc insc--common'],
    ]);
    expect(text(first.querySelector('.ov-formation'))).toBe('Delta');
    // short like the rest of the site; the troop icon before a troop's bonus
    const bonus = (li: Element) => `${text(li.querySelector('.ov-bonuses__label'))} ${text(li.querySelector('.ov-bonuses__value'))}`;
    expect(Array.from(first.querySelectorAll('.ov-bonuses li'), bonus)).toEqual(['Cav ATK +12%', 'Cav DEF +12,6%', 'All DMG +1,6%']);
    expect(first.querySelectorAll('img.ov-bonuses__icon').length).toBe(2);
    // the second: one commander, no build – All DMG at 0 % left out (Gether 11. 11. 2026)
    expect(text(second.querySelector('.ov-march__names'))).toBe('Sun Tzu 5511');
    expect(Array.from(second.querySelectorAll('.ov-bonuses li'), bonus)).toEqual(['Inf ATK +9%']);
    // the empty parts keep their row, so the columns line up (subgrid): six parts in every column
    expect(second.querySelector('.ov-inscs .insc')).toBeNull();
    expect(text(second.querySelector('.ov-formation'))).toBe('');
    for (const column of columns) expect(column.children.length).toBe(6);
  });

  it('says so when the marches do not load', async () => {
    const setup = render(USER, 'error');
    await load(setup);
    expect(text(setup.el.querySelector('.ov-state'))).toBe('Marche sa nepodarilo načítať. Skús to znova o chvíľu.');
  });
});

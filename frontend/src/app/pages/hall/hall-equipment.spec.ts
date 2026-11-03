import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it } from 'vitest';
import { armoryIndex } from '../../core/armory';
import { ARMORY } from '../../core/armory-testing';
import { March } from '../../core/kvk-api';
import { EQUIPMENT_KINDS, EquipmentData, EquipmentPlayer, equipmentRanking } from '../evaluation/equipment';
import { normalizeSettings } from '../evaluation/settings';
import { equipmentWinners } from './equipment-winners';
import { HallAdmin } from './hall-admin';
import { EQUIPMENT_TROOPS, troopOfPlace } from './hall-data';

const INDEX = armoryIndex(ARMORY);

// the requests resolve in promises – let them finish, then render
const tick = async (fixture: { detectChanges(): void }) => {
  await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
};

let id = 0;
const march = (kind: March['kind'], gear: March['gear'] = {}): March => ({
  id: ++id,
  position: id,
  kind,
  primary: 'Attila',
  secondary: 'Achilles',
  gear,
});
const player = (pk: number, name: string, marches: March[]): EquipmentPlayer => ({ id: pk, name, avatar_url: '', marches });
const legendary = { weapon: { item: 'sacred-dominion', crit: true, iconic: 5 }, chest: { item: 'heavy-armor', crit: false, iconic: 0 } };
const epic = { boots: { item: 'wasteland-boots', crit: false, iconic: 0 } };

// Nelly the best on cavalry, Fox on infantry, nobody on archers (Bobo has an archer march without any gear)
const DATA: EquipmentData = {
  settings: {},
  players: [
    player(1, 'Nelly', [march('cavalry', legendary), march('infantry', epic)]),
    player(2, 'Fox', [march('cavalry', epic), march('infantry', legendary)]),
    player(3, 'Bobo', [march('archer')]),
  ],
};

describe('the best equipment of the Hall of Fame', () => {
  it('has its places in the order of the troop types of Top 5 equip', () => {
    expect([...EQUIPMENT_TROOPS]).toEqual([...EQUIPMENT_KINDS]);
    expect([1, 2, 3, 4].map(troopOfPlace)).toEqual(['infantry', 'cavalry', 'archer', null]);
  });

  it('takes the first player of Top 5 equip of each troop type, nobody where nobody scored', () => {
    const settings = normalizeSettings(DATA.settings);
    const first = (kind: (typeof EQUIPMENT_KINDS)[number]) => equipmentRanking(settings, INDEX, kind, DATA.players)[0];
    const winners = equipmentWinners(DATA, INDEX);
    expect(winners.map((p) => p?.name ?? null)).toEqual(['Fox', 'Nelly', null]);
    expect(winners[0]).toBe(first('infantry').player);
    expect(winners[1]).toBe(first('cavalry').player);
    // Bobo is first among the archers, but with nothing to score
    expect(first('archer').total).toBe(0);
  });
});

describe('the hall editor fills the best equipment from Top 5 equip', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('shows the winners first and writes the three places at once', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), { provide: PLATFORM_ID, useValue: 'browser' }],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(HallAdmin);
    fixture.detectChanges();
    // Nelly already stands on the infantry place with a photo – it moves with her to cavalry
    const nelly = { id: 41, category: 'equipment', place: 1, name: 'Nelly', avatar_url: '', photo: '/api/hall/photos/41/?v=1', note: { sk: 'pechota', cs: 'pěchota' }, count: '', player: 1 };
    http.expectOne('/api/hall/').flush({
      entries: [nelly],
      places: { forts: 3, kp: 5, rally: 1, garrison: 1, helper: 1, diplomat: 1, equipment: 3, mascot: 2, zero: 3 },
    });
    http.expectOne('/api/kvk/reviewers/').flush({ players: [] });
    await tick(fixture);
    const el = fixture.nativeElement as HTMLElement;
    const button = (text: string) => Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === text)!;

    button('Načítať z Top 5 equip').click();
    http.expectOne('/api/evaluation/equipment/').flush(DATA);
    http.expectOne('/api/armory/').flush(ARMORY);
    await tick(fixture);
    const rows = Array.from(el.querySelectorAll('.fill__row')).map((r) =>
      Array.from(r.querySelectorAll('span'))
        .map((span) => span.textContent?.trim())
        .join(' '),
    );
    expect(rows).toEqual(['pechota Fox', 'jazda Nelly', 'lukostrelci nikto – miesto ostane prázdne']);

    button('Zapísať').click();
    const put = http.expectOne('/api/hall/equipment/');
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({
      entries: [
        { player: 2, name: '', count: '', note_sk: 'pechota', note_cs: 'pěchota', photo_from: null },
        { player: 1, name: '', count: '', note_sk: 'jazda', note_cs: 'jízda', photo_from: 41 },
        null,
      ],
    });
    put.flush({
      entries: [
        { ...nelly, id: 42, place: 1, name: 'Fox', photo: '', player: 2 },
        { ...nelly, place: 2, note: { sk: 'jazda', cs: 'jízda' } },
      ],
    });
    await tick(fixture);
    expect(el.querySelector('.fill__row')).toBeNull();
    expect(el.textContent).toContain('Uložené.');
  });
});

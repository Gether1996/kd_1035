import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ArmoryData, GEAR_SLOTS, Gear, armoryIndex, itemSlot } from '../../core/armory';
import { March } from '../../core/kvk-api';
import { EquipmentPlayer, bestGear, equipmentRanking, kitOf } from './equipment';
import { EvalEquipmentTab } from './equipment-tab';
import { equipmentPoints } from './scoring';
import { normalizeSettings } from './settings';
import { EVAL_TEXTS } from './texts';

// a legendary (iconic), an epic and a second legendary accessory; one set of two cavalry pieces
const CATALOG: ArmoryData = {
  verified: '2026-10',
  sources: [],
  sets: [
    {
      id: 'set',
      name: 'Set',
      pieces: ['set-weapon', 'set-helmet'],
      bonuses: [{ count: 2, text: 'Cavalry Attack +100%', stats: { cavalry_attack: 100 } }],
    },
  ],
  formations: [
    { id: 'wedge', name: 'Wedge', icon: '', inscriptions: [] },
    { id: 'pincer', name: 'Pincer', icon: '', inscriptions: [] },
  ],
  common: [],
  items: [
    ...GEAR_SLOTS.filter((s) => s !== 'accessory2').flatMap((slot) => [
      { id: `gold-${itemSlot(slot)}`, name: `Gold ${slot}`, slot: itemSlot(slot), rarity: 'legendary' as const, stats: { cavalry_attack: 5 }, crit: { cavalry_attack: 6 }, iconic: true, icon: '' },
      { id: `epic-${itemSlot(slot)}`, name: `Epic ${slot}`, slot: itemSlot(slot), rarity: 'epic' as const, stats: { cavalry_attack: 2 }, crit: { cavalry_attack: 3 }, icon: '' },
    ]),
    { id: 'gold-accessory-2', name: 'Gold ring', slot: 'accessory' as const, rarity: 'legendary' as const, stats: {}, crit: {}, iconic: true, icon: '' },
    { id: 'set-weapon', name: 'Set weapon', slot: 'weapon' as const, rarity: 'epic' as const, stats: {}, crit: {}, set: 'set', icon: '' },
    { id: 'set-helmet', name: 'Set helmet', slot: 'helmet' as const, rarity: 'epic' as const, stats: {}, crit: {}, set: 'set', icon: '' },
  ],
};
const INDEX = armoryIndex(CATALOG);
const S = normalizeSettings(null);

let id = 0;
const march = (change: Partial<March> = {}): March => ({
  id: ++id,
  position: id,
  kind: 'cavalry',
  primary: 'Attila',
  secondary: 'Achilles',
  ...change,
});
const player = (marches: March[], name = 'Nelly'): EquipmentPlayer => ({ id: ++id, name, avatar_url: '', marches });
const all = (rarity: 'gold' | 'epic', iconic = 0): Gear =>
  Object.fromEntries(GEAR_SLOTS.map((slot) => [slot, { item: `${rarity}-${itemSlot(slot)}`, crit: false, iconic }]));

describe('Top 5 equip', () => {
  it('takes the best piece of each slot of all marches of the type', () => {
    // the legendary weapon and boots on Attila, the legendary helmet with a crit on Takeda
    const a = march({ gear: { ...all('epic'), weapon: { item: 'gold-weapon', crit: false, iconic: 3 }, boots: { item: 'gold-boots', crit: false, iconic: 0 } } });
    const b = march({ primary: 'Takeda Shingen', gear: { ...all('epic'), helmet: { item: 'gold-helmet', crit: true, iconic: 0 } } });
    const { gear, sources } = bestGear(S, INDEX, 'cavalry', [a, b]);
    expect(gear.weapon).toEqual({ item: 'gold-weapon', crit: false, iconic: 3 });
    expect(gear.helmet).toEqual({ item: 'gold-helmet', crit: true, iconic: 0 });
    expect(gear.boots?.item).toBe('gold-boots');
    expect(gear.chest?.item).toBe('epic-chest');
    expect([sources.weapon, sources.helmet, sources.boots]).toEqual([a, b, a]);
    // better than either march alone
    const kit = kitOf(S, INDEX, 'cavalry', player([a, b]))!;
    const alone = (m: March) => equipmentPoints(S, { ...m }, INDEX).points;
    expect(kit.equipment.points).toBeGreaterThan(Math.max(alone(a), alone(b)));
    expect(kit.equipment.legendary).toBe(3);
  });

  it('the two best accessories of all marches, two different items', () => {
    const a = march({ gear: { accessory1: { item: 'gold-accessory', crit: true, iconic: 5 }, accessory2: { item: 'epic-accessory', crit: false, iconic: 0 } } });
    const b = march({ gear: { accessory1: { item: 'gold-accessory', crit: false, iconic: 1 }, accessory2: { item: 'gold-accessory-2', crit: false, iconic: 2 } } });
    const { gear } = bestGear(S, INDEX, 'cavalry', [a, b]);
    expect(gear.accessory1).toEqual({ item: 'gold-accessory', crit: true, iconic: 5 });
    expect(gear.accessory2).toEqual({ item: 'gold-accessory-2', crit: false, iconic: 2 });
  });

  it("one march's own gear when a set it completes scores more than the pieces put together", () => {
    const settings = normalizeSettings({ equipment: { statsWeight: 1 } });
    const set = march({ gear: { weapon: { item: 'set-weapon', crit: false, iconic: 0 }, helmet: { item: 'set-helmet', crit: false, iconic: 0 } } });
    const other = march({ gear: { weapon: { item: 'gold-weapon', crit: true, iconic: 0 } } });
    const kit = kitOf(settings, INDEX, 'cavalry', player([set, other]))!;
    expect(kit.gear).toEqual(set.gear);
    expect(kit.sources.weapon).toBe(set);
  });

  it('the strongest formation with its armaments, and the total by the weights', () => {
    const weak = march({ formation: 'pincer', attack: 2, defense: 2, health: 2 });
    const strong = march({ formation: 'wedge', attack: 10, defense: 9, health: 7, damage: 3 });
    const kit = kitOf(S, INDEX, 'cavalry', player([weak, strong]))!;
    expect(kit.formation).toBe('wedge');
    expect(kit.armamentsFrom).toBe(strong);
    expect(kit.total).toBeCloseTo(kit.equipment.points * 0.75 + kit.armaments.points * 0.25, 9);
    // nothing filled in: no formation
    expect(kitOf(S, INDEX, 'cavalry', player([march()]))!.armamentsFrom).toBeNull();
  });

  it('takes the KvK sign-ups (rally, garrison) with these troops too', () => {
    const p = player([march({ gear: all('epic') })]);
    p.signups = [
      { id: 90, role: 'rally', kind: 'cavalry', primary: 'Attila', secondary: 'Takeda Shingen', gear: { weapon: { item: 'gold-weapon', crit: true, iconic: 5 } } },
      { id: 91, role: 'garrison', kind: 'infantry', primary: 'Charles Martel', secondary: '', gear: all('gold', 5) },
    ];
    const kit = kitOf(S, INDEX, 'cavalry', p)!;
    expect([kit.marches, kit.signups]).toEqual([1, ['rally']]);
    expect(kit.gear.weapon).toEqual({ item: 'gold-weapon', crit: true, iconic: 5 });
    expect(kit.sources.weapon?.role).toBe('rally');
    // a sign-up alone puts the player in the ranking
    const only = player([]);
    only.signups = [{ id: 92, role: 'garrison', kind: 'archer', primary: 'Yi Seong-Gye', secondary: '', gear: all('gold') }];
    expect(equipmentRanking(S, INDEX, 'archer', [only]).map((k) => [k.marches, k.signups])).toEqual([[0, ['garrison']]]);
  });

  it('ranks the players with a march of the type, the best first', () => {
    const top = player([march({ gear: all('gold', 4) })], 'Top');
    const low = player([march({ gear: all('epic') }), march({ kind: 'infantry', gear: all('gold', 5) })], 'Low');
    const archer = player([march({ kind: 'archer', gear: all('gold') })], 'Arch');
    expect(equipmentRanking(S, INDEX, 'cavalry', [low, archer, top]).map((k) => k.player.name)).toEqual(['Top', 'Low']);
    expect(equipmentRanking(S, INDEX, 'infantry', [low, archer, top]).map((k) => [k.player.name, k.marches])).toEqual([['Low', 1]]);
  });
});

describe('Top 5 equip – the tab', () => {
  async function open() {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const signed = player([march({ gear: all('epic') })], 'Signed');
    signed.signups = [{ id: 95, role: 'garrison', kind: 'cavalry', primary: 'Attila', secondary: '', gear: all('epic') }];
    const best = player([march({ gear: all('gold', 5) })], 'Best');
    // signed up, but with other troops: not a cavalry sign-up
    const infantry = player([march({ gear: all('gold', 1) })], 'Infantry');
    infantry.signups = [{ id: 96, role: 'rally', kind: 'infantry', primary: 'Gorgo', secondary: '', gear: {} }];
    const fixture = TestBed.createComponent(EvalEquipmentTab);
    fixture.componentRef.setInput('data', { settings: {}, players: [signed, best, infantry] });
    fixture.componentRef.setInput('armory', INDEX);
    fixture.componentRef.setInput('texts', EVAL_TEXTS.sk);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    // cavalry
    el.querySelectorAll<HTMLButtonElement>('.eq-kinds button')[1].click();
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, el, signed, infantry };
  }
  const names = (el: HTMLElement) => Array.from(el.querySelectorAll('.eq-name'), (n) => n.textContent);

  it('"Len prihlásení na KvK" keeps the players signed up with these troops', async () => {
    const { fixture, el } = await open();
    expect(names(el)).toEqual(['Best', 'Infantry', 'Signed']);
    const toggle = el.querySelector<HTMLInputElement>('.eq-signed input')!;
    expect(el.querySelector('.eq-signed')?.textContent?.trim()).toBe('Len prihlásení na KvK');
    expect(toggle.checked).toBe(false);
    toggle.click();
    fixture.detectChanges();
    expect(names(el)).toEqual(['Signed']);
    // the rank is of the shown players
    expect(el.querySelector('.eq-rank')?.textContent?.trim()).toBe('1');
    // infantry: nobody signed up with them but Infantry
    el.querySelectorAll<HTMLButtonElement>('.eq-kinds button')[0].click();
    fixture.detectChanges();
    expect(names(el)).toEqual(['Infantry']);
    el.querySelectorAll<HTMLButtonElement>('.eq-kinds button')[2].click();
    fixture.detectChanges();
    expect(el.querySelector('.eq-empty')?.textContent).toBe('Na KvK sa s týmto typom jednotiek zatiaľ neprihlásil žiadny schválený hráč.');
  });

  it("a card links to the player's KvK sign-ups on /kvk – only a player who has some", async () => {
    const { el, signed, infantry } = await open();
    const links = (name: string) => {
      const card = [...el.querySelectorAll('.eq-item')].find((c) => c.querySelector('.eq-name')?.textContent === name)!;
      return Array.from(card.querySelectorAll<HTMLAnchorElement>('.eq-links a'), (a) => a.getAttribute('href'));
    };
    expect(links('Signed')).toEqual([`/marche?hrac=${signed.id}`, `/kvk?tab=prihlasky&hrac=${signed.id}`]);
    // a sign-up with other troops is a sign-up too
    expect(links('Infantry')).toEqual([`/marche?hrac=${infantry.id}`, `/kvk?tab=prihlasky&hrac=${infantry.id}`]);
    expect(links('Best')).toHaveLength(1);
  });
});

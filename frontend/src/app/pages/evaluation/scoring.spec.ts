import { ArmoryData, GEAR_SLOTS, Gear, armoryIndex, itemSlot } from '../../core/armory';
import { March } from '../../core/kvk-api';
import {
  EvalPlayer,
  armamentPoints,
  equipmentPoints,
  evaluate,
  expectedMarches,
  inscriptionValue,
  marchEval,
  missingPairs,
  parsePowerList,
  pairTable,
  quickMatch,
  skillFactor,
} from './scoring';
import { DEFAULT_INSCRIPTIONS, DEFAULT_SETTINGS, EvalSettings, PairRow, normalizeSettings, rowsFor, toSave } from './settings';

// one legendary (iconic) and one epic item for every slot
const CATALOG: ArmoryData = {
  verified: '2026-10',
  sources: [],
  sets: [],
  formations: [
    {
      id: 'pincer',
      name: 'Pincer',
      icon: '',
      inscriptions: [
        { id: 'pincer-instrument-charge', name: 'Charge', rarity: 'rare', piece: 'instrument' },
        { id: 'pincer-flag-tidebreaker', name: 'Tidebreaker', rarity: 'special', piece: 'flag' },
        { id: 'pincer-scroll-vigor', name: 'Vigor', rarity: 'rare', piece: 'scroll' },
      ],
    },
    { id: 'arch', name: 'Arch', icon: '', inscriptions: [{ id: 'arch-scroll-destructive', name: 'Destructive', rarity: 'special', piece: 'scroll' }] },
  ],
  common: [{ id: 'common-brave', name: 'Brave', rarity: 'common', piece: 'emblem' }],
  items: GEAR_SLOTS.filter((s) => s !== 'accessory2').flatMap((slot) => [
    { id: `gold-${itemSlot(slot)}`, name: 'Gold', slot: itemSlot(slot), rarity: 'legendary' as const, stats: { cavalry_attack: 5 }, crit: { cavalry_attack: 6.5 }, iconic: true, icon: '' },
    { id: `epic-${itemSlot(slot)}`, name: 'Epic', slot: itemSlot(slot), rarity: 'epic' as const, stats: { cavalry_attack: 2 }, crit: { cavalry_attack: 2.6 }, icon: '' },
  ]),
};
const INDEX = armoryIndex(CATALOG);

const gear = (rarity: 'gold' | 'epic', crit: boolean, iconic: number, slots: number = GEAR_SLOTS.length): Gear =>
  Object.fromEntries(GEAR_SLOTS.slice(0, slots).map((slot) => [slot, { item: `${rarity}-${itemSlot(slot)}`, crit, iconic }]));

const march = (change: Partial<March> = {}): March => ({
  id: 1,
  position: 1,
  kind: 'archer',
  primary: 'Qin Shi Huang',
  secondary: 'Yi Seong-Gye',
  primary_skills: '5555',
  secondary_skills: '5555',
  ...change,
});

const player = (id: number, marches: March[], change: Partial<EvalPlayer> = {}): EvalPlayer => ({
  id,
  name: `p${id}`,
  ingame_name: `P${id}`,
  avatar_url: '',
  approved: true,
  marches,
  power: null,
  t4: false,
  power_bonus: 0,
  ...change,
});

// the commander pairs live in the database (guides.CommanderPair) – the tests bring a few
const PAIRS: PairRow[] = [
  ['Qin Shi Huang', 'Zhuge Liang', 120],
  ['Qin Shi Huang', 'Yi Seong-Gye', 117],
  ['Gang Gamchan', 'Achilles', 99],
  ['Attila', 'Achilles', 92],
  ['Ivan IV', 'Achilles', 50],
  ['Ivar the Boneless', 'Achilles', 0],
];
const S: EvalSettings = normalizeSettings(null, PAIRS);
const withPairs = (value: unknown) => normalizeSettings(value, PAIRS);

describe('evaluation scoring', () => {
  it('counts the armaments like the spreadsheet (Maros666, M1: 56.92 points)', () => {
    const m = march({ attack: 10.1, defense: 9.5, health: 7, damage: 3.3, gold: 1, blue: 1, white: 2 });
    expect(armamentPoints(S, m).points).toBeCloseTo(56.9157, 3);
    expect(armamentPoints(S, march()).filled).toBe(false);
  });

  it('counts an armament bonus over its cap as the cap (Gether 19. 10. 2026: 14 % ATK, DEF, HP, 8 % All DMG)', () => {
    const capped = armamentPoints(S, march({ attack: 14, defense: 14, health: 14, damage: 8 })).stats;
    expect(armamentPoints(S, march({ attack: 30, defense: 14.1, health: 99.9, damage: 24 })).stats).toBeCloseTo(capped, 9);
    expect(armamentPoints(S, march({ attack: 13, defense: 14, health: 14, damage: 8 })).stats).toBeLessThan(capped);
  });

  it('a march total like the spreadsheet: (equipment × 0.75 + armaments × 0.25) × pair / 100', () => {
    // B+ = 72: all legendary, 6 of 8 refined, iconic II–III – here 72 exactly by the slot weights
    const settings = withPairs({ equipment: { statsWeight: 0 } });
    const m = march({ attack: 10.1, defense: 9.5, health: 7, damage: 3.3, gold: 1, blue: 1, white: 2 });
    const e = marchEval(settings, pairTable(settings), m, INDEX);
    const equipment = e.equipment.points; // no gear: 0
    expect(equipment).toBe(0);
    expect(e.pair).toEqual({ points: 117, source: 'table' });
    expect(e.total).toBeCloseTo((0 * 0.75 + 56.9157 * 0.25) * 1.17, 3);
  });

  it('judges the equipment by rarity, refine and iconic like the tiers of the spreadsheet', () => {
    const points = (g: Gear) => equipmentPoints(S, march({ gear: g }), INDEX);
    expect(points(gear('gold', true, 5))).toMatchObject({ points: 100, tier: 'S+', pieces: 8, legendary: 8, crit: 8, iconic: 5 });
    expect(points(gear('gold', true, 4))).toMatchObject({ points: 90, tier: 'A' });
    expect(points(gear('gold', true, 3))).toMatchObject({ points: 85, tier: 'A-' });
    expect(points(gear('gold', false, 0))).toMatchObject({ points: 50, tier: 'C' });
    expect(points(gear('epic', false, 0)).tier).toBe('F');
    // half the slots empty: half the points
    expect(points(gear('gold', false, 0, 4)).points).toBe(25);
    expect(points({}).tier).toBe('');
    // without the catalog nothing can be judged
    expect(equipmentPoints(S, march({ gear: gear('gold', true, 5) }), null)).toMatchObject({ points: 0, known: false });
  });

  it('can blend in the real bonuses of the equipment', () => {
    const settings = withPairs({ equipment: { statsWeight: 0.5, statsMax: 100 } });
    const e = equipmentPoints(settings, march({ kind: 'cavalry', gear: gear('gold', false, 0) }), INDEX);
    // 8 × 5 % cavalry attack = 40 of 100 → 40 points, half of it with 50 from the pieces
    expect(e.stats).toBe(40);
    expect(e.points).toBe(45);
  });

  it('scores a pair only from the table, in its order (Slim 13. 10. 2026)', () => {
    const table = pairTable(S);
    // the other order is a row of its own – not in the table, not evaluated
    expect(marchEval(S, table, march({ primary: 'Zhuge Liang', secondary: 'Qin Shi Huang' }), null).pair).toEqual({ points: 0, source: 'unknown' });
    expect(marchEval(S, table, march({ secondary: '' }), null).pair).toEqual({ points: 0, source: 'solo' });
    expect(marchEval(S, table, march({ primary: '' }), null).pair).toEqual({ points: 0, source: 'none' });
    expect(marchEval(S, table, march({ primary: 'Ivan IV', secondary: 'Achilles' }), null).pair).toEqual({ points: 50, source: 'table' });
    // names are compared without case and diacritics
    expect(marchEval(S, table, march({ primary: 'qin shi huang', secondary: 'ZHUGE LIANG' }), null).pair.points).toBe(120);
  });

  it('does not count a march whose pair is not evaluated – the next one counts instead', () => {
    const marches = [
      march({ id: 1, position: 1, gear: gear('gold', false, 0) }),
      march({ id: 2, position: 2, primary: 'Alexander Nevsky', secondary: 'Achilles', gear: gear('gold', true, 5) }),
      march({ id: 3, position: 3, primary: 'Ivar the Boneless', secondary: 'Achilles', gear: gear('gold', true, 5) }),
      march({ id: 4, position: 4, secondary: '', gear: gear('gold', true, 5) }),
      march({ id: 5, position: 5, primary: 'Attila', secondary: 'Achilles', gear: gear('gold', false, 0) }),
    ];
    const row = evaluate(withPairs({ marches: { max: 2 } }), [player(1, marches)], INDEX).rows[0];
    expect(row.marches.map((m) => [m.march.id, m.skipped])).toEqual([[1, null], [2, 'pair'], [3, 'pair'], [4, 'pair'], [5, null]]);
    expect(row.counted).toBe(2);
  });

  it('lowers the armaments of a march in a formation its primary commander should not use (Gether 14. 10. 2026)', () => {
    const settings = normalizeSettings({ formations: { wrong: 0.5 } }, PAIRS, { 'qin shi huang': ['pincer', 'wedge'], Attila: [] });
    const table = pairTable(settings);
    const base = { attack: 10, defense: 9, health: 8, gold: 2, blue: 1, white: 1 };
    const right = marchEval(settings, table, march({ ...base, formation: 'wedge' }), INDEX);
    const wrong = marchEval(settings, table, march({ ...base, formation: 'arch' }), INDEX);
    const none = marchEval(settings, table, march(base), INDEX);
    expect(right.formation).toEqual({ preferred: ['pincer', 'wedge'], ok: true });
    expect(wrong.formation.ok).toBe(false);
    expect(none.formation.ok).toBeNull();
    expect(wrong.armaments.points).toBeCloseTo(right.armaments.points * 0.5, 9);
    expect(none.armaments.points).toBeCloseTo(right.armaments.points, 9);
    // a commander without a formation set (or an empty list) takes any
    const attila = marchEval(settings, table, march({ ...base, primary: 'Attila', secondary: 'Achilles', formation: 'arch' }), INDEX);
    expect(attila.formation).toEqual({ preferred: [], ok: null });
    expect(Object.keys(settings.formations.byCommander)).toEqual(['qin shi huang']);
  });

  it('lowers a pair of unfinished commanders, both the same', () => {
    expect(skillFactor(S, march())).toBe(1);
    // both 1111: the spreadsheet scored such pairs about a third of the full one
    expect(skillFactor(S, march({ primary_skills: '1111', secondary_skills: '1111' }))).toBeCloseTo(0.3, 5);
    const sunTzu5511 = skillFactor(S, march({ primary_skills: '5511' }));
    expect(sunTzu5511).toBeCloseTo(0.3 + 0.7 * Math.pow(0.75, 1.5), 9);
    // no weight of the primary or the secondary any more (Slim: "váha skillov primary alebo secondary je zlá")
    expect(skillFactor(S, march({ secondary_skills: '5511' }))).toBe(sunTzu5511);
  });

  it('scores the inscriptions clicked together by the tier list, the rest by colour', () => {
    // Charge A 40, Tidebreaker S 50, Destructive D 5, Vigor B 30, Brave (white, no tier) 10
    expect(DEFAULT_INSCRIPTIONS).toMatchObject({ Charge: 'A', Tidebreaker: 'S', Destructive: 'D', Vigor: 'B' });
    expect(DEFAULT_INSCRIPTIONS['Brave']).toBeUndefined();
    const ids = ['pincer-instrument-charge', 'pincer-flag-tidebreaker', 'arch-scroll-destructive', 'pincer-scroll-vigor', 'common-brave'];
    const m = march({ attack: 10.1, defense: 9.5, health: 7, damage: 3.3, gold: 2, blue: 2, white: 1, inscriptions: ids });
    const a = armamentPoints(S, m, INDEX);
    expect(a.tiered).toBe(true);
    expect(a.inscriptions).toBeCloseTo((135 / 200) * 70, 9);
    // a tier of its own, or none: by colour
    const charge = withPairs({ armaments: { inscriptions: { Charge: 'S' }, tiers: { S: 60 } } });
    expect(armamentPoints(charge, march({ inscriptions: ['pincer-instrument-charge'] }), INDEX).inscriptions).toBeCloseTo((60 / 200) * 70, 9);
    const none = withPairs({ armaments: { inscriptions: {} } });
    expect(armamentPoints(none, march({ inscriptions: ['pincer-instrument-charge'] }), INDEX).inscriptions).toBeCloseTo((25 / 200) * 70, 9);
    // without the catalog, or only the counts typed in before: by colour like the spreadsheet
    expect(armamentPoints(S, m, null)).toMatchObject({ tiered: false, inscriptions: ((2 * 50 + 2 * 25 + 10) / 200) * 70 });
  });

  it('counts the second Delta armaments a little over the old Delta gold and blue (Gether 29. 10. 2026)', () => {
    const value = (name: string, rarity: 'special' | 'rare') => inscriptionValue(DEFAULT_SETTINGS, { name, rarity });
    expect(['Raging Tide', 'Impervious', 'Bold Ambitions', 'Rapid Advance'].map((n) => value(n, 'special'))).toEqual([55, 55, 55, 55]);
    expect(['Surge', 'Steady', 'Burst', 'Driven'].map((n) => value(n, 'rare'))).toEqual([45, 45, 45, 45]);
    expect([value('Flurry', 'special'), value('Causative', 'rare')]).toEqual([50, 40]);
    // variables saved before: the new tiers get their points
    expect(normalizeSettings({ armaments: { tiers: { S: 52 } } }).armaments.tiers).toMatchObject({ 'S+': 55, S: 52, 'A+': 45 });
  });

  it('expects more marches with more power: the fewest whose recommended power carries it', () => {
    // 66, 72, 82, 93, 105 M carry 1 … 5 marches
    expect([50, 66, 66.5, 72, 81.9, 82, 88, 93, 94, 120].map((p) => expectedMarches(S, p))).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
    expect(expectedMarches(withPairs({ marches: { max: 3 } }), 120)).toBe(3);
  });

  it('counts the best open-field marches; the acclaim is the benchmark × power^1.35 × marches^0.8 × quality', () => {
    // a pair of 50 points, legendary pieces without refine or iconic (50)
    const good = (id: number, kind: March['kind'] = 'archer') =>
      march({ id, kind, primary: 'Ivan IV', secondary: 'Achilles', attack: 10.1, defense: 9.5, health: 7, damage: 3.3, gold: 1, blue: 1, white: 2, gear: gear('gold', false, 0) });
    const marches = [good(1), good(2), good(3, 'garrison')];
    const { rows, benchmark } = evaluate(S, [player(1, marches, { power: 100 })], INDEX);
    const row = rows[0];
    // the benchmark of the variables: 102 M, 5 marches, the average march of the score 286.53
    expect(benchmark).toEqual({ power: 102, marches: 5, quality: 286.53 / 5 });
    // the garrison does not count
    expect(row.counted).toBe(2);
    expect(row.marches.map((m) => [m.march.id, m.counted, m.skipped])).toEqual([[1, true, null], [2, true, null], [3, false, 'kind']]);
    const one = (50 * 0.75 + 56.9157 * 0.25) * 0.5;
    expect(row.marchScore).toBeCloseTo(2 * one, 2);
    expect(row.quality).toBeCloseTo(one, 2);
    // 2 marches carry 72 M – whatever their quality (Gether 26. 10. 2026); 100 M asks for 5: 3 missing
    expect(row.recommended).toBe(72);
    expect(row.excess).toBe(28);
    expect([row.expected, row.missing, row.marchCount]).toEqual([5, 3, 5]);
    // the factors: (100 / 102)^1.35; the 5 marches 100 M asks for count as there; the quality within ± 20 %
    expect(row.acclaim.power).toBeCloseTo(Math.pow(100 / 102, 1.35), 9);
    expect(row.acclaim.marches).toBeCloseTo(1, 9);
    expect(row.acclaim.quality).toBeCloseTo(1 + 0.2 * (row.quality / (286.53 / 5) - 1), 9);
    const { power, marches: count, quality } = row.acclaim;
    expect(row.acclaim.required).toBe(Math.round((5_600_000 * power * count * quality) / 1000) * 1000);
  });

  it('gives everyone with the same number of marches the same recommended power', () => {
    const weak = (id: number) => march({ id, primary: 'Ivan IV', secondary: 'Achilles', gear: gear('epic', false, 0) });
    const strong = (id: number) =>
      march({ id, primary: 'Ivan IV', secondary: 'Achilles', attack: 12, defense: 12, health: 12, damage: 6, gold: 4, gear: gear('gold', true, 5) });
    const rows = evaluate(
      S,
      [
        player(1, [1, 2, 3, 4, 5].map(weak), { power: 95 }),
        player(2, [6, 7, 8, 9, 10].map(strong), { power: 170 }),
        player(3, [11, 12, 13].map(strong), { power: 107 }),
        player(4, [14].map(weak), { power: 39, power_bonus: 2 }),
      ],
      INDEX,
    ).rows;
    expect(rows.map((r) => r.recommended)).toEqual([105, 105, 82, 68]);
    // more power than the marches carry: red, and the marches the power asks for count (3 +2)
    expect(rows.map((r) => r.missing)).toEqual([0, 0, 2, 0]);
  });

  it('adds acclaim for the power not even the full number of marches carries (Gether 26. 10. 2026: SKAPALS 170 M)', () => {
    const same = (id: number) => march({ id, primary: 'Ivan IV', secondary: 'Achilles', gear: gear('gold', false, 0) });
    const marches = (n: number, from: number) => Array.from({ length: n }, (_, i) => same(from + i));
    const [skapals, twoBig, full] = evaluate(
      S,
      [player(1, marches(5, 1), { power: 170 }), player(2, marches(2, 10), { power: 100 }), player(3, marches(5, 20), { power: 105 })],
      INDEX,
    ).rows;
    // 5 marches carry 105 M: 65 M of it is surplus, 32 000 each on top of the curves
    expect([skapals.acclaim.surplus, skapals.acclaim.surcharge]).toEqual([65, 65 * 32_000]);
    const base = 5_600_000 * skapals.acclaim.power * skapals.acclaim.marches * skapals.acclaim.quality;
    expect(skapals.acclaim.required).toBe(Math.round((base + 65 * 32_000) / 1000) * 1000);
    // 100 M with 2 marches owes the 5 marches the power asks for, but no surplus – they carry it; 105 M is no surplus
    expect([twoBig.acclaim.surplus, full.acclaim.surplus]).toEqual([0, 0]);
    // not counting the missing marches: the power above the 72 M of the two marches is the surplus
    const [counted] = evaluate(withPairs({ power: { expected: false } }), [player(4, marches(2, 30), { power: 100 })], INDEX).rows;
    expect(counted.acclaim.surplus).toBe(28);
    // switched off
    const [off] = evaluate(withPairs({ power: { surplus: 0 } }), [player(5, marches(5, 40), { power: 170 })], INDEX).rows;
    expect(off.acclaim.surcharge).toBe(0);
    expect(off.acclaim.required).toBe(Math.round(base / 1000) * 1000);
  });

  it('is fair to small accounts (Gether 26. 10. 2026: a T4 player with 1 march and 40 M close to bigger ones)', () => {
    const same = (id: number) => march({ id, primary: 'Ivan IV', secondary: 'Achilles', gear: gear('gold', false, 0) });
    const marches = (n: number, from: number) => Array.from({ length: n }, (_, i) => same(from + i));
    const [small, legend, hanz, slim] = evaluate(
      S,
      [
        player(1, marches(1, 1), { power: 39, t4: true }),
        player(2, marches(2, 10), { power: 61, t4: true }),
        player(3, marches(3, 20), { power: 80.5 }),
        player(4, marches(5, 30), { power: 102 }),
      ],
      INDEX,
    ).rows;
    // no power counts as more than it is: 39 M is 39 M
    expect(small.acclaim.power).toBeCloseTo(Math.pow(39 / 102, 1.35), 9);
    expect(small.acclaim.marches).toBeCloseTo(Math.pow(1 / 5, 0.8), 9);
    // the same quality: the parts multiply – a seventh of the 3-march T5 player at 80 M, a tenth of 5 marches at 102 M
    expect(small.acclaim.required / hanz.acclaim.required).toBeCloseTo(Math.pow(39 / 80.5, 1.35) * Math.pow(1 / 3, 0.8) * 0.89, 2);
    expect(small.acclaim.required / hanz.acclaim.required).toBeLessThan(0.2);
    expect(small.acclaim.required / slim.acclaim.required).toBeLessThan(0.1);
    // more power, more marches – more acclaim, every step
    expect(small.acclaim.required).toBeLessThan(legend.acclaim.required);
    expect(legend.acclaim.required).toBeLessThan(hanz.acclaim.required);
    expect(hanz.acclaim.required).toBeLessThan(slim.acclaim.required);
    // 40 M and 55 M with one march each do not owe the same any more
    const [p40, p55] = evaluate(S, [player(5, [same(40)], { power: 40 }), player(6, [same(41)], { power: 55 })], INDEX).rows;
    expect(p55.acclaim.required / p40.acclaim.required).toBeCloseTo(Math.pow(55 / 40, 1.35), 1);
  });

  it('puts the power and the march count first (Gether 24. 10. 2026: 5 marches and more power vs 2 strong marches)', () => {
    const same = (id: number) => march({ id, primary: 'Ivan IV', secondary: 'Achilles', gear: gear('gold', false, 0) });
    const strong = (id: number) =>
      march({ id, primary: 'Ivan IV', secondary: 'Achilles', attack: 12, defense: 12, health: 12, damage: 6, gold: 4, gear: gear('gold', true, 3) });
    const [five, two, twoStrong] = evaluate(
      S,
      [
        player(1, [1, 2, 3, 4, 5].map(same), { power: 91 }),
        player(2, [same(6), same(7)], { power: 77 }),
        player(3, [strong(8), strong(9)], { power: 77 }),
      ],
      INDEX,
    ).rows;
    // 77 M asks for 3 marches: one missing
    expect(two.missing).toBe(1);
    expect(two.acclaim.marches).toBeCloseTo(Math.pow(3 / 5, 0.8), 9);
    expect(five.acclaim.required / two.acclaim.required).toBeCloseTo(Math.pow(91 / 77, 1.35) * Math.pow(5 / 3, 0.8), 1);
    // 100 M with 2 marches: the player's fault – owes as with the 5 marches the power asks for
    const [big] = evaluate(S, [player(6, [same(12), same(13)], { power: 100 })], INDEX).rows;
    expect(big.acclaim.marches).toBe(1);
    // a low power with 2 marches owes less for the 3 missing
    const [small] = evaluate(S, [player(7, [same(14), same(15)], { power: 68 })], INDEX).rows;
    expect(small.acclaim.marches).toBeCloseTo(Math.pow(2 / 5, 0.8), 9);
    // far better marches move it at most by the quality band – never up to the five marches and more power
    expect(twoStrong.quality).toBeGreaterThan(two.quality);
    expect(twoStrong.acclaim.required).toBeGreaterThan(two.acclaim.required);
    expect(twoStrong.acclaim.quality).toBeLessThanOrEqual(1.2);
    expect(five.acclaim.required).toBeGreaterThan(twoStrong.acclaim.required * 1.25);
  });

  it('without power: the recommended power stands in; the minimum and T4', () => {
    const [none, bare, t4, estimate] = evaluate(
      S,
      [
        player(1, []),
        player(2, [], { power: 100 }),
        player(3, [], { power: 100, t4: true }),
        player(4, [march({ gear: gear('gold', false, 0) })]),
      ],
      INDEX,
    ).rows;
    expect([none.expected, none.missing, none.score, none.power, none.acclaim.required]).toEqual([null, 0, 0, null, 200_000]);
    // 100 M and no march: the power and the 5 marches it asks for count, the lowest quality
    expect(bare.acclaim.marches).toBeCloseTo(1, 9);
    expect(bare.acclaim.quality).toBeCloseTo(0.8, 9);
    const sum = 5_600_000 * Math.pow(100 / 102, 1.35) * 0.8;
    expect(bare.acclaim.required).toBe(Math.round(sum / 1000) * 1000);
    expect(t4.acclaim.required).toBe(Math.round((sum * 0.89) / 1000) * 1000);
    // one march and no power written down: the recommended power of one march counts, nothing above it
    expect(estimate.power).toBe(66);
    expect(estimate.power).toBe(estimate.recommended);
    expect(estimate.excess).toBe(0);
  });

  it('takes the benchmark from a player', () => {
    const players = [1, 2, 3, 4, 5].map((id) => player(id, [march({ id, gear: gear('gold', false, id) })]));
    const picked = evaluate(withPairs({ power: { expected: false }, acclaim: { player: 3 } }), players, INDEX);
    // the picked player's average march; without a power of their own the benchmark power of the variables
    expect(picked.benchmark.quality).toBe(picked.rows[2].quality);
    expect(picked.benchmark.power).toBe(102);
    // a player like the benchmark – its power, the full number of marches, its average march – has its acclaim
    const like = evaluate(
      withPairs({ acclaim: { power: 100, score: 5 * picked.rows[2].quality } }),
      [player(9, [1, 2, 3, 4, 5].map((id) => march({ id, gear: gear('gold', false, 3) })), { power: 100 })],
      INDEX,
    ).rows[0];
    expect(like.acclaim.required).toBe(5_600_000);
  });

  it('lists the pairs players use that are not in the table, with the other order when it is there', () => {
    const players = [
      player(1, [march({ primary: 'Alexander Nevsky', secondary: 'Achilles', kind: 'cavalry' })]),
      player(2, [
        march({ primary: 'Alexander Nevsky', secondary: 'Achilles', kind: 'cavalry' }),
        march({ primary: 'Attila', secondary: 'Achilles', kind: 'cavalry' }),
        march({ primary: 'Achilles', secondary: 'Gang Gamchan', kind: 'cavalry' }),
      ]),
      player(3, [march({ primary: 'Charles Martel', secondary: 'Richard', kind: 'garrison' })]),
    ];
    expect(missingPairs(S, players)).toEqual([
      { primary: 'Alexander Nevsky', secondary: 'Achilles', players: 2, reversed: null },
      { primary: 'Achilles', secondary: 'Gang Gamchan', players: 1, reversed: 99 },
    ]);
  });

  it('normalises what the server keeps', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    const s = normalizeSettings(
      {
        marches: { kinds: ['cavalry', 'nope'], max: 9 },
        // the pairs of the JSON do not count – they have a table of their own
        pairs: { rows: [['Qin Shi Huang', 'Zhuge Liang', 120]], unknown: 50, reversed: 0.9 },
        // a row saved before 26. 10. 2026 ({min, max, …}: its highest power), a number, a broken one
        power: { table: [{ min: 60, max: 70, scoreMin: 1 }, 80, 'x'], spread: 50 },
        acclaim: { benchmark: 'x', score: 0, player: 7, powerBase: 60, missingMarch: 10, powerCurve: 9 },
        armaments: { inscriptions: { Charge: 'S', Fury: 'Z', ' ': 'A' }, tiers: { A: -5 } },
        extra: 1,
      },
      [['Attila', 'Achilles', 92], ['bad'], ['', 'x', 1], ['A', 'B', 'x'], ['attila', 'ACHILLES', 5], ['Ivan IV', 'Achilles', 116]],
    );
    expect(s.acclaim).toMatchObject({ benchmark: 5_600_000, score: 0.01, player: 7 });
    expect(s.marches.kinds).toEqual(['cavalry']);
    expect(s.marches.max).toBe(9);
    expect(s.power.table.length).toBe(9);
    expect(withPairs({ marches: { max: 12 } }).marches.max).toBe(10);
    // a pair written twice: the first row; the best first
    expect(s.pairs).toEqual({ rows: [['Ivan IV', 'Achilles', 116], ['Attila', 'Achilles', 92]], minimum: 0.3, curve: 1.5 });
    expect(s.armaments.inscriptions).toEqual({ Charge: 'S' });
    expect(s.armaments.tiers).toEqual({ ...DEFAULT_SETTINGS.armaments.tiers, A: 0 });
    // saved before the tier list: the default one
    expect(normalizeSettings({ armaments: { gold: 40 } }).armaments).toMatchObject({ gold: 40, inscriptions: DEFAULT_INSCRIPTIONS });
    // the old row's highest power, the number, the default; past 5 marches by the last step
    expect(s.power).toEqual({ expected: true, table: [70, 80, 82, 93, 105, 117, 129, 141, 153], surplus: 32_000 });
    // the variables of the model before 26. 10. 2026 are dropped, a curve kept within its bounds
    expect(s.acclaim.powerCurve).toBe(4);
    expect(s.acclaim.marchCurve).toBe(0.8);
    expect('powerBase' in s.acclaim || 'missingMarch' in s.acclaim).toBe(false);
    expect('extra' in s).toBe(false);
  });

  it('saves the variables without the pair table, the table on its own', () => {
    const { settings, pairs } = toSave({ ...S, pairs: { ...S.pairs, rows: [['', '', 0], ...PAIRS.slice(0, 2)] } });
    expect(pairs).toEqual(PAIRS.slice(0, 2));
    expect((settings as EvalSettings).pairs).toEqual({ minimum: 0.3, curve: 1.5 });
    expect(normalizeSettings(settings, pairs).pairs.rows).toEqual(PAIRS.slice(0, 2));
  });


  it('can leave the power out', () => {
    const players = [player(1, [march({ gear: gear('gold', false, 0) })], { power: 120 })];
    const off = evaluate(S, players, INDEX, false).rows[0];
    const on = evaluate(S, players, INDEX).rows[0];
    expect([off.expected, off.missing, off.excess]).toEqual([null, 0, 0]);
    expect(on.missing).toBe(4);
    expect(on.acclaim.required).toBeGreaterThan(off.acclaim.required);
    // the power written down stays
    expect(off.player.power).toBe(120);
  });

  it('reads the power of many players pasted at once', () => {
    const players = [
      player(1, [], { ingame_name: 'Gether', name: 'gether' }),
      player(2, [], { ingame_name: 'Maros666', name: 'maros' }),
      player(3, [], { ingame_name: 'Ježíš', name: 'jezis' }),
      player(4, [], { ingame_name: 'Twin', name: 'a' }),
      player(5, [], { ingame_name: 'twin', name: 'b' }),
    ];
    const { found, unknown } = parsePowerList(
      'Gether 101,5\nMaros666;110 M\n  jezis: 93.25 \n\nnobody 50\nTwin 60\nno number here\nmaros 115 500 000',
      players,
    );
    // the last line of a player wins; a full number is millions
    expect(found).toEqual([
      { id: 1, power: 101.5 },
      { id: 2, power: 115.5 },
      { id: 3, power: 93.3 },
    ]);
    expect(unknown).toEqual(['nobody 50', 'Twin 60', 'no number here']);
  });

  it('counts the best X marches, whatever their place in the player\'s order (Gether 16. 10. 2026)', () => {
    // seven marches, the later ones better (more inscriptions)
    const marches = [1, 2, 3, 4, 5, 6, 7].map((n) => march({ id: n, position: n, gold: n, gear: gear('gold', false, 0) }));
    const counted = (settings: EvalSettings, list = marches) =>
      evaluate(settings, [player(1, list)], INDEX).rows[0].marches.filter((m) => m.counted).map((m) => m.march.position);
    expect(counted(withPairs({ marches: { max: 3 } }))).toEqual([5, 6, 7]);
    expect(counted(withPairs({ marches: { max: 7 } }))).toEqual([1, 2, 3, 4, 5, 6, 7]);
    // the strongest one last still counts
    const strongLast = marches.map((m) => ({ ...m, gold: m.position === 7 ? 9 : 1 }));
    expect(counted(withPairs({ marches: { max: 5 } }), strongLast)).toEqual([1, 2, 3, 4, 7]);
    // shown in the player's order, the ones over the limit marked
    const row = evaluate(withPairs({ marches: { max: 3 } }), [player(1, marches)], INDEX).rows[0];
    expect(row.marches.map((m) => [m.march.position, m.skipped])).toEqual([
      [1, 'limit'], [2, 'limit'], [3, 'limit'], [4, 'limit'], [5, null], [6, null], [7, null],
    ]);
  });

  it('goes on with the power table past 5 marches', () => {
    // by the last step of the spreadsheet's table (93 → 105: +12)
    expect(rowsFor(7, DEFAULT_SETTINGS.power.table)).toEqual([66, 72, 82, 93, 105, 117, 129]);
    expect(rowsFor(2, [])).toEqual([66, 72]);
    // 7 marches counted: 125 M of power asks for all seven
    const settings = withPairs({ marches: { max: 7 } });
    expect(expectedMarches(settings, 125)).toBe(7);
    expect(expectedMarches(settings, 110)).toBe(6);
  });

  it('picks the players for the quick filters: to fix, without power, over the recommended power', () => {
    const settings = normalizeSettings({ marches: { max: 1 } }, PAIRS, { 'qin shi huang': ['pincer'] });
    const ok = march({ id: 1, position: 1, formation: 'pincer', gear: gear('gold', false, 0) });
    const players = [
      // a solo march (skipped as an unevaluated pair)
      player(1, [ok, march({ id: 2, position: 2, secondary: '' })], { power: 60 }),
      // a counted march in a formation its primary should not lead with
      player(2, [march({ id: 3, position: 1, formation: 'arch', gear: gear('gold', false, 0) })]),
      // a valid march over the max, and a garrison (a type that does not count) without a secondary: nothing to fix
      player(3, [ok, march({ id: 4, position: 2, formation: 'pincer' }), march({ id: 5, position: 3, kind: 'garrison', secondary: '' })], {
        power: 200,
      }),
      // a pair not in the table
      player(4, [march({ id: 6, position: 1, primary: 'Alexander Nevsky', secondary: 'Achilles' })]),
      // a march over the max in a wrong formation – /marche says so too
      player(5, [ok, march({ id: 7, position: 2, formation: 'arch' })]),
      // an armament bonus over its cap, even on a type that does not count (Gether 19. 10. 2026)
      player(6, [ok, march({ id: 8, position: 2, kind: 'garrison', damage: 8.1 })], { power: 60 }),
    ];
    const rows = evaluate(settings, players, INDEX).rows;
    expect(rows[2].marches.map((m) => m.skipped)).toEqual([null, 'limit', 'kind']);
    const ids = (filter: Parameters<typeof quickMatch>[0]) => rows.filter((r) => quickMatch(filter, r)).map((r) => r.player.id);
    expect(ids('all')).toEqual([1, 2, 3, 4, 5, 6]);
    expect(ids('fix')).toEqual([1, 2, 4, 5, 6]);
    expect(ids('nopower')).toEqual([2, 4, 5]);
    // "Odp. power" in red: more power than the own counted marches carry
    expect(rows[2].ownLimit).not.toBeNull();
    expect(ids('over')).toEqual([3]);
  });
});

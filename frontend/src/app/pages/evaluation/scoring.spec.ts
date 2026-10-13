import { ArmoryData, GEAR_SLOTS, Gear, armoryIndex, itemSlot } from '../../core/armory';
import { March } from '../../core/kvk-api';
import {
  EvalPlayer,
  armamentPoints,
  equipmentPoints,
  evaluate,
  expectedMarches,
  marchEval,
  missingPairs,
  parsePowerList,
  pairTable,
  percentile,
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
  acclaim: null,
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

  it('PERCENTILE like the spreadsheet', () => {
    expect(percentile([1, 2, 3, 4, 5], 10)).toBeCloseTo(1.4, 9);
    expect(percentile([1, 2, 3, 4, 5], 90)).toBeCloseTo(4.6, 9);
    expect(percentile([], 50)).toBe(0);
  });

  it('expects more marches with more power', () => {
    expect([50, 63, 66, 72, 81.9, 82, 88, 120].map((p) => expectedMarches(S, p))).toEqual([1, 1, 2, 3, 3, 4, 5, 5]);
    expect(expectedMarches(withPairs({ marches: { max: 3 } }), 120)).toBe(3);
  });

  it('counts the best open-field marches, adds the marches the power asks for and the acclaim of the excess power', () => {
    const settings = withPairs({ power: { auto: false } });
    // a pair of 50 points, legendary pieces without refine or iconic (50)
    const good = (id: number, kind: March['kind'] = 'archer') =>
      march({ id, kind, primary: 'Ivan IV', secondary: 'Achilles', attack: 10.1, defense: 9.5, health: 7, damage: 3.3, gold: 1, blue: 1, white: 2, gear: gear('gold', false, 0) });
    const marches = [good(1), good(2), good(3, 'garrison')];
    const { rows, perPoint } = evaluate(settings, [player(1, marches, { power: 100, acclaim: 2_000_000 })], INDEX);
    const row = rows[0];
    expect(perPoint).toBeCloseTo(5_600_000 / 286.53, 6);
    // the garrison does not count
    expect(row.counted).toBe(2);
    expect(row.marches.map((m) => [m.march.id, m.counted, m.skipped])).toEqual([[1, true, null], [2, true, null], [3, false, 'kind']]);
    const one = (50 * 0.75 + 56.9157 * 0.25) * 0.5;
    expect(row.marchScore).toBeCloseTo(2 * one, 2);
    // 100 M power asks for 5 marches: 3 missing, each like the average march
    expect([row.expected, row.missing]).toEqual([5, 3]);
    expect(row.score).toBeCloseTo(5 * one, 2);
    // 5 marches: 88–105 M over the score 141.36–288.17 – a score below the range is the lowest power
    expect(row.recommended).toBe(88);
    expect(row.excess).toBe(12);
    expect(row.acclaim.excess).toBe(row.excess * 32_000);
    expect(row.acclaim.required).toBe(Math.round((row.score * perPoint + row.excess * 32_000) / 1000) * 1000);
    // with only the two marches the power should be at most this
    expect(row.ownLimit).toBeLessThan(73);
    expect(row.progress).toBeCloseTo(2_000_000 / row.acclaim.required, 9);
    expect(row.fund).toBeCloseTo(1_500_000_000 * (1 - row.progress!), 0);
  });

  it('without power: no missing marches; the minimum, the power floor and T4', () => {
    const settings = withPairs({ power: { auto: false, floor: 50_000 } });
    const [none, floor, t4] = evaluate(
      settings,
      [player(1, []), player(2, [], { power: 100 }), player(3, [], { power: 100, t4: true })],
      INDEX,
    ).rows;
    expect([none.expected, none.missing, none.score, none.acclaim.required]).toEqual([null, 0, 0, 200_000]);
    // 100 M and no march: 5 marches of 40 points expected, at least 50 000 per million
    expect(floor.score).toBe(200);
    expect(floor.acclaim.floor).toBe(5_000_000);
    expect(floor.acclaim.required).toBeGreaterThanOrEqual(5_000_000);
    expect(t4.acclaim.required).toBe(Math.round((floor.acclaim.required * 0.89) / 1000) * 1000);
  });

  it('takes the benchmark from a player and the score ranges from the players', () => {
    const players = [1, 2, 3, 4, 5].map((id) => player(id, [march({ id, gear: gear('gold', false, id) })]));
    const auto = evaluate(withPairs({ power: { samples: 5, expected: false }, acclaim: { player: 3 } }), players, INDEX);
    expect(auto.ranges[0].auto).toBe(true);
    expect(auto.ranges[0].players).toBe(5);
    expect(auto.benchmarkScore).toBe(auto.rows[2].score);
    expect(auto.rows[2].acclaim.required).toBe(5_600_000);
    // too few players: the spreadsheet's ranges
    const fixed = evaluate(withPairs({ power: { samples: 6 } }), players, INDEX);
    expect(fixed.ranges[0]).toEqual({ min: 2.06, max: 39.23, auto: false, players: 5 });
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
        acclaim: { benchmark: 'x', score: 0, player: 7 },
        marches: { kinds: ['cavalry', 'nope'], max: 9 },
        // the pairs of the JSON do not count – they have a table of their own
        pairs: { rows: [['Qin Shi Huang', 'Zhuge Liang', 120]], unknown: 50, reversed: 0.9 },
        power: { table: [{ min: 60 }], low: 250 },
        armaments: { inscriptions: { Charge: 'S', Fury: 'Z', ' ': 'A' }, tiers: { A: -5 } },
        extra: 1,
      },
      [['Attila', 'Achilles', 92], ['bad'], ['', 'x', 1], ['A', 'B', 'x'], ['attila', 'ACHILLES', 5], ['Ivan IV', 'Achilles', 116]],
    );
    expect(s.acclaim).toMatchObject({ benchmark: 5_600_000, score: 0.01, player: 7 });
    expect(s.marches.kinds).toEqual(['cavalry']);
    expect(s.marches.max).toBe(9);
    expect(s.power.table.length).toBe(9);
    expect(s.fund.max.length).toBe(9);
    expect(withPairs({ marches: { max: 12 } }).marches.max).toBe(10);
    // a pair written twice: the first row; the best first
    expect(s.pairs).toEqual({ rows: [['Ivan IV', 'Achilles', 116], ['Attila', 'Achilles', 92]], minimum: 0.3, curve: 1.5 });
    expect(s.armaments.inscriptions).toEqual({ Charge: 'S' });
    expect(s.armaments.tiers).toEqual({ ...DEFAULT_SETTINGS.armaments.tiers, A: 0 });
    // saved before the tier list: the default one
    expect(normalizeSettings({ armaments: { gold: 40 } }).armaments).toMatchObject({ gold: 40, inscriptions: DEFAULT_INSCRIPTIONS });
    expect(s.power.table[0]).toEqual({ ...DEFAULT_SETTINGS.power.table[0], min: 60 });
    expect(s.power.low).toBe(100);
    expect('extra' in s).toBe(false);
  });

  it('saves the variables without the pair table, the table on its own', () => {
    const { settings, pairs } = toSave({ ...S, pairs: { ...S.pairs, rows: [['', '', 0], ...PAIRS.slice(0, 2)] } });
    expect(pairs).toEqual(PAIRS.slice(0, 2));
    expect((settings as EvalSettings).pairs).toEqual({ minimum: 0.3, curve: 1.5 });
    expect(normalizeSettings(settings, pairs).pairs.rows).toEqual(PAIRS.slice(0, 2));
  });


  it('can leave the power out', () => {
    const settings = withPairs({ power: { auto: false } });
    const players = [player(1, [march({ gear: gear('gold', false, 0) })], { power: 120 })];
    const off = evaluate(settings, players, INDEX, false).rows[0];
    const on = evaluate(settings, players, INDEX).rows[0];
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

  it('counts the first X marches in the player\'s order, or the best X', () => {
    // seven marches, the later ones better (more inscriptions)
    const marches = [1, 2, 3, 4, 5, 6, 7].map((n) => march({ id: n, position: n, gold: n, gear: gear('gold', false, 0) }));
    const counted = (settings: EvalSettings) =>
      evaluate(settings, [player(1, marches)], INDEX).rows[0].marches.filter((m) => m.counted).map((m) => m.march.position);
    expect(counted(withPairs({ marches: { max: 3 } }))).toEqual([1, 2, 3]);
    expect(counted(withPairs({ marches: { max: 3, order: 'best' } }))).toEqual([5, 6, 7]);
    expect(counted(withPairs({ marches: { max: 7 } }))).toEqual([1, 2, 3, 4, 5, 6, 7]);
    // shown in the player's order, the ones over the limit marked
    const row = evaluate(withPairs({ marches: { max: 3 } }), [player(1, marches)], INDEX).rows[0];
    expect(row.marches.map((m) => [m.march.position, m.skipped])).toEqual([
      [1, null], [2, null], [3, null], [4, 'limit'], [5, 'limit'], [6, 'limit'], [7, 'limit'],
    ]);
  });

  it('goes on with the power table and the fund past 5 marches', () => {
    const { table, fund } = rowsFor(7, DEFAULT_SETTINGS.power.table, DEFAULT_SETTINGS.fund.max);
    expect(table[5]).toEqual({ min: 105, max: 122, scoreMin: 288.17, scoreMax: 288.17 + (288.17 - 141.36) });
    expect(table[6].min).toBe(122);
    expect(fund.slice(5)).toEqual([1_800_000_000, 2_100_000_000]);
    // 7 marches counted: 125 M of power asks for all seven
    const settings = withPairs({ marches: { max: 7 } });
    expect(expectedMarches(settings, 125)).toBe(7);
    expect(expectedMarches(settings, 110)).toBe(6);
  });
});

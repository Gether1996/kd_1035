import { GEAR_SLOTS, GearSlot, ITEM_RARITIES, ItemRarity } from '../../core/armory';
import { MARCH_KINDS, MarchKind } from '../../core/kvk-api';

/**
 * The variables of the KvK evaluation (/vyhodnocovanie, Gether 13. 10. 2026). The defaults are the constants of the
 * spreadsheet "KVK Requirements Troy 2026" (sheets Constants, Commander Pair Scoring, Fond Bojovej Podpory); what the
 * spreadsheet judged by eye from a screenshot (the equipment tier, unfinished commanders) is computed here from what
 * the players clicked together, and power counts more (Gether: "najdôležitejšia je power").
 */
export interface EvalSettings {
  acclaim: {
    /** the acclaim of the benchmark player (spreadsheet: Slim Dejvid, 5 600 000) */
    benchmark: number;
    /** the benchmark's total score when no player is picked (spreadsheet: 286.53) */
    score: number;
    /** a player whose score is the benchmark (null = the number above) */
    player: number | null;
    /** nobody goes below this (spreadsheet: 200 000) */
    minimum: number;
    /** a player with T4 troops only gets this much less, % (spreadsheet note: 11 %) */
    t4: number;
    /** the estimate is rounded to this */
    round: number;
  };
  power: {
    /** acclaim for each million of power above the recommended power (spreadsheet: 16 000 × 2) */
    excess: number;
    /** at least this much acclaim for each million of power, 0 = off */
    floor: number;
    /** a player is expected to have as many marches as the power table says for their power */
    expected: boolean;
    /** a missing march counts as this % of the player's average counted march */
    phantom: number;
    /** a missing march of a player with no counted march at all */
    emptyMarch: number;
    /** 1–5 marches: the power range and the score range it is spread over */
    table: PowerRow[];
    /** the score ranges from the players themselves (percentiles below), when a group has enough of them */
    auto: boolean;
    low: number;
    high: number;
    samples: number;
  };
  marches: {
    /** which march types count (open field) */
    kinds: MarchKind[];
    /** the best this many count */
    max: number;
    /** the weights of the equipment and the armaments in a march (spreadsheet: 0.75 / 0.25) */
    equipment: number;
    armaments: number;
  };
  armaments: {
    /** % of a bonus that makes one point (spreadsheet: ATK 3, DEF 2.75, HP 1.8, All DMG 1) */
    attack: number;
    defense: number;
    health: number;
    damage: number;
    /** the points of the best armaments (spreadsheet: 17.76) */
    combatMax: number;
    /** the share of the bonuses and of the inscriptions (spreadsheet: 30 / 70) */
    statsWeight: number;
    inscWeight: number;
    gold: number;
    blue: number;
    white: number;
    /** the inscription points of the best armaments (spreadsheet: 200) */
    inscMax: number;
  };
  equipment: {
    /** the points of a piece by its rarity, the crit (refine) and iconic I–V on top */
    base: Record<ItemRarity, number>;
    crit: Record<ItemRarity, number>;
    /** iconic I … V, each level the total */
    iconic: number[];
    /** the weight of each slot */
    slots: Record<GearSlot, number>;
    /** how much the real bonuses of the equipment count (0 = only rarity, crit and iconic) */
    statsWeight: number;
    /** ATK + DEF + HP % of the march's troops that makes 100 */
    statsMax: number;
    /** the tiers of the spreadsheet: the lowest points of each */
    tiers: Tier[];
  };
  pairs: {
    /** primary, secondary, points (100 = a full meta pair) */
    rows: PairRow[];
    /** a pair that is not in the table */
    unknown: number;
    /** the pair in the table the other way round: its points × this */
    reversed: number;
    /** a primary commander without a secondary */
    solo: number;
    /** the skill levels: how much the primary and the secondary weigh, the factor of 1111 and the curve */
    primary: number;
    secondary: number;
    minimum: number;
    curve: number;
  };
  fund: {
    /** the most a player pays at 0 % of the acclaim, by the number of marches (1–5) */
    max: number[];
    /** the shares of food, wood, stone and gold (spreadsheet: 2/7, 2/7, 1/7, 2/7) */
    food: number;
    wood: number;
    stone: number;
    gold: number;
  };
}

export interface PowerRow {
  min: number;
  max: number;
  scoreMin: number;
  scoreMax: number;
}

export interface Tier {
  tier: string;
  points: number;
}

export type PairRow = [primary: string, secondary: string, points: number];

/**
 * The commander pairs of the spreadsheet (sheet Commander Pair Scoring, source meta-rok.com tier list), with the
 * names of our roster. Left out: commanders nobody can pick here (Mulan, Eulji Mundeok, Julius Caesar, Frederick I,
 * Mehmed II) and the rows for unfinished commanders – the skill levels clicked in count for those now.
 */
export const DEFAULT_PAIRS: PairRow[] = [
  ['Qin Shi Huang', 'Zhuge Liang', 120],
  ['Qin Shi Huang', 'Yi Seong-Gye', 117],
  ['Sun Tzu Prime', 'Bai Qi', 110],
  ['Sun Tzu Prime', 'Liu Che', 110],
  ['Arthur Pendragon', 'Achilles', 100],
  ['Sun Tzu Prime', 'William Wallace', 95],
  ['Alp Arslan', 'Hermann Prime', 95],
  ['Sun Tzu Prime', 'Ivar the Boneless', 95],
  ['Attila', 'Achilles', 92],
  ['Hermann Prime', 'Alp Arslan', 92],
  ['Bai Qi', 'Liu Che', 92],
  ['Achilles', 'Gang Gamchan', 92],
  ['Gang Gamchan', 'Achilles', 92],
  ['William Wallace', 'Bai Qi', 88],
  ['Bai Qi', 'Ivar the Boneless', 88],
  ['Gajah Mada', 'Gonzalo de Cordoba', 84],
  ['Bai Qi', 'William Wallace', 84],
  ['Hermann Prime', 'Zhuge Liang', 84],
  ['Arthur Pendragon', 'David IV', 84],
  ['Arthur Pendragon', 'Gang Gamchan', 84],
  ['Huo Qubing', 'Arthur Pendragon', 84],
  ['Alp Arslan', 'Yi Seong-Gye', 84],
  ['Arthur Pendragon', 'Hector', 84],
  ['Philip II', 'Zhuge Liang', 84],
  ['Ragnar Lodbrok Prime', 'Scipio Africanus Prime', 84],
  ['Alp Arslan', 'Zhuge Liang', 84],
  ['Bai Qi', 'Vercingetorix', 84],
  ['Scipio Africanus Prime', 'Ragnar Lodbrok Prime', 80],
  ['Zhuge Liang', 'Hermann Prime', 80],
  ['Attila', 'David IV', 80],
  ['Alp Arslan', 'Philip II', 80],
  ['Liu Che', 'Vercingetorix', 80],
  ['Joan of Arc Prime', 'Arthur Pendragon', 78],
  ['Arthur Pendragon', 'Philip II', 78],
  ['Liu Che', 'Philip II', 78],
  ['Qin Shi Huang', 'Shajar al-Durr', 78],
  ['Qin Shi Huang', 'Alp Arslan', 78],
  ['Zhuge Liang', 'Philip II', 78],
  ['Margaret I', 'Gonzalo de Cordoba', 78],
  ['Bai Qi', 'Philip II', 78],
  ['William Wallace', 'Liu Che', 78],
  ['Scipio Africanus Prime', 'Liu Che', 78],
  ['Liu Che', 'William Wallace', 78],
  ['Shajar al-Durr', 'Alp Arslan', 72],
  ['Zhuge Liang', 'Ashurbanipal', 70],
  ['Ragnar Lodbrok Prime', 'Philip II', 70],
  ['Huo Qubing', 'Joan of Arc Prime', 70],
  ['Huo Qubing', 'Belisarius Prime', 70],
  ['Liu Che', 'Cheok Jun-gyeong', 66],
  ['Liu Che', 'Alexander the Great', 66],
  ['Cheok Jun-gyeong', 'Liu Che', 66],
  ['Alexander Nevsky', 'Joan of Arc Prime', 66],
  ['Alexander Nevsky', 'Belisarius Prime', 66],
  ['Bai Qi', 'Alexander the Great', 60],
  ['Philip II', 'Tariq ibn Ziyad', 60],
  ['Guan Yu', 'Scipio Africanus Prime', 55],
  ['Alexander Nevsky', 'William I', 55],
  ['Boudica Prime', 'Yi Seong-Gye', 55],
  ['Yi Seong-Gye', 'Aethelflaed', 33],
  ['Minamoto', 'Saladin', 30],
  ['Minamoto', 'Cao Cao', 25],
  ['Richard', 'Charles Martel', 15],
  ['Aethelflaed', 'Cao Cao', 7],
  ['Aethelflaed', 'Joan of Arc', 5],
];

const TIERS: Tier[] = [
  ['S+', 100], ['S', 99], ['S-', 98], ['A+', 95], ['A', 90], ['A-', 85], ['B+', 72], ['B', 68],
  ['B-', 58], ['C+', 52], ['C', 50], ['C-', 40], ['D+', 30], ['D', 25], ['D-', 20], ['F', 5],
].map(([tier, points]) => ({ tier: tier as string, points: points as number }));

export const DEFAULT_SETTINGS: EvalSettings = {
  acclaim: { benchmark: 5_600_000, score: 286.53, player: null, minimum: 200_000, t4: 11, round: 1000 },
  power: {
    excess: 32_000,
    floor: 0,
    expected: true,
    phantom: 100,
    emptyMarch: 40,
    // sheet Constants: power 63–66 … 88–105 M; the score ranges are its percentiles 10 and 90 of the last KvK
    table: [
      { min: 63, max: 66, scoreMin: 2.06, scoreMax: 39.23 },
      { min: 66, max: 72, scoreMin: 20.95, scoreMax: 78.51 },
      { min: 72, max: 82, scoreMin: 89.2, scoreMax: 145.67 },
      { min: 82, max: 93, scoreMin: 139.29, scoreMax: 219.97 },
      { min: 88, max: 105, scoreMin: 141.36, scoreMax: 288.17 },
    ],
    auto: true,
    low: 10,
    high: 90,
    samples: 5,
  },
  marches: { kinds: ['infantry', 'cavalry', 'archer', 'leadership', 'engineering'], max: 5, equipment: 0.75, armaments: 0.25 },
  armaments: {
    attack: 3,
    defense: 2.75,
    health: 1.8,
    damage: 1,
    combatMax: 17.76,
    statsWeight: 30,
    inscWeight: 70,
    gold: 50,
    blue: 25,
    white: 10,
    inscMax: 200,
  },
  equipment: {
    // calibrated on the tiers: 8 × legendary = C (50), + refine and iconic IV = A (90), iconic V = S+ (100)
    base: { legendary: 50, epic: 15, elite: 8, advanced: 4, common: 2 },
    crit: { legendary: 15, epic: 8, elite: 4, advanced: 0, common: 0 },
    iconic: [5, 12, 20, 25, 35],
    slots: { weapon: 1, helmet: 1, chest: 1, gloves: 1, legs: 1, boots: 1, accessory1: 1, accessory2: 1 },
    statsWeight: 0,
    statsMax: 180,
    tiers: TIERS,
  },
  pairs: {
    rows: DEFAULT_PAIRS,
    unknown: 50,
    reversed: 0.9,
    solo: 30,
    primary: 0.75,
    secondary: 0.25,
    minimum: 0.3,
    curve: 1.5,
  },
  fund: { max: [400e6, 600e6, 900e6, 1200e6, 1500e6], food: 2, wood: 2, stone: 1, gold: 2 },
};

// ---------------------------------------------------------------- normalising what the server keeps

const num = (value: unknown, fallback: number, min = -1e12, max = 1e12): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

const obj = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/** every number of a flat group, each kept within its bounds */
function group<T extends object>(value: unknown, defaults: T, min = 0, max = 1e12): T {
  const raw = obj(value);
  return Object.fromEntries(Object.entries(defaults).map(([k, d]) => [k, num(raw[k], d as number, min, max)])) as T;
}

const list = (value: unknown, defaults: number[], min = 0, max = 1e12): number[] => {
  const raw = Array.isArray(value) ? value : [];
  return defaults.map((d, i) => num(raw[i], d, min, max));
};

/**
 * The saved variables merged into the defaults: every value checked (a number within its bounds, the right length
 * of a list) – something missing or wrong takes the default, keys the page does not know are dropped.
 */
export function normalizeSettings(value: unknown): EvalSettings {
  const d = DEFAULT_SETTINGS;
  const raw = obj(value);
  const acclaim = obj(raw['acclaim']);
  const power = obj(raw['power']);
  const marches = obj(raw['marches']);
  const equipment = obj(raw['equipment']);
  const pairs = obj(raw['pairs']);
  const fund = obj(raw['fund']);
  const table = Array.isArray(power['table']) ? power['table'] : [];
  const tiers = Array.isArray(equipment['tiers']) ? equipment['tiers'] : [];
  const kinds = Array.isArray(marches['kinds']) ? marches['kinds'] : d.marches.kinds;
  const rows = Array.isArray(pairs['rows']) ? pairs['rows'] : d.pairs.rows;
  const player = acclaim['player'];
  return {
    acclaim: {
      benchmark: num(acclaim['benchmark'], d.acclaim.benchmark, 0),
      score: num(acclaim['score'], d.acclaim.score, 0.01),
      player: typeof player === 'number' && Number.isInteger(player) ? player : null,
      minimum: num(acclaim['minimum'], d.acclaim.minimum, 0),
      t4: num(acclaim['t4'], d.acclaim.t4, 0, 100),
      round: num(acclaim['round'], d.acclaim.round, 1),
    },
    power: {
      excess: num(power['excess'], d.power.excess, 0),
      floor: num(power['floor'], d.power.floor, 0),
      expected: typeof power['expected'] === 'boolean' ? power['expected'] : d.power.expected,
      phantom: num(power['phantom'], d.power.phantom, 0, 200),
      emptyMarch: num(power['emptyMarch'], d.power.emptyMarch, 0, 1000),
      table: d.power.table.map((row, i) => group(table[i], row)),
      auto: typeof power['auto'] === 'boolean' ? power['auto'] : d.power.auto,
      low: num(power['low'], d.power.low, 0, 100),
      high: num(power['high'], d.power.high, 0, 100),
      samples: Math.round(num(power['samples'], d.power.samples, 2, 1000)),
    },
    marches: {
      kinds: MARCH_KINDS.filter((k) => kinds.includes(k)),
      max: Math.round(num(marches['max'], d.marches.max, 1, 5)),
      equipment: num(marches['equipment'], d.marches.equipment, 0, 10),
      armaments: num(marches['armaments'], d.marches.armaments, 0, 10),
    },
    armaments: {
      ...group(raw['armaments'], d.armaments),
      // divisors: never 0
      ...group(raw['armaments'], {
        attack: d.armaments.attack,
        defense: d.armaments.defense,
        health: d.armaments.health,
        damage: d.armaments.damage,
        combatMax: d.armaments.combatMax,
        inscMax: d.armaments.inscMax,
      }, 0.01),
    },
    equipment: {
      base: group(equipment['base'], d.equipment.base),
      crit: group(equipment['crit'], d.equipment.crit),
      iconic: list(equipment['iconic'], d.equipment.iconic),
      slots: group(equipment['slots'], d.equipment.slots, 0, 10),
      statsWeight: num(equipment['statsWeight'], d.equipment.statsWeight, 0, 1),
      statsMax: num(equipment['statsMax'], d.equipment.statsMax, 1),
      tiers: d.equipment.tiers.map((tier, i) => ({ tier: tier.tier, points: num(obj(tiers[i])['points'], tier.points, 0, 1000) })),
    },
    pairs: {
      rows: rows
        .filter((r): r is unknown[] => Array.isArray(r) && r.length === 3)
        .filter(([p, s, n]) => typeof p === 'string' && typeof s === 'string' && typeof n === 'number' && Number.isFinite(n))
        .map(([p, s, n]) => [(p as string).trim(), (s as string).trim(), Math.max(0, Math.min(500, n as number))] as PairRow)
        .filter(([p]) => !!p),
      unknown: num(pairs['unknown'], d.pairs.unknown, 0, 500),
      reversed: num(pairs['reversed'], d.pairs.reversed, 0, 2),
      solo: num(pairs['solo'], d.pairs.solo, 0, 500),
      primary: num(pairs['primary'], d.pairs.primary, 0, 10),
      secondary: num(pairs['secondary'], d.pairs.secondary, 0, 10),
      minimum: num(pairs['minimum'], d.pairs.minimum, 0, 1),
      curve: num(pairs['curve'], d.pairs.curve, 0.1, 5),
    },
    fund: {
      max: list(fund['max'], d.fund.max),
      ...group(fund, { food: d.fund.food, wood: d.fund.wood, stone: d.fund.stone, gold: d.fund.gold }),
    },
  };
}

export const RARITIES = ITEM_RARITIES;
export const SLOTS = GEAR_SLOTS;

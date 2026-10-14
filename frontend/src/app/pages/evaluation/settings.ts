import { GEAR_SLOTS, GearSlot, ITEM_RARITIES, ItemRarity } from '../../core/armory';
import { MARCH_KINDS, MarchKind } from '../../core/kvk-api';
import { fold } from '../../shared/search';

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
    /** this many count (up to MARCHES_LIMIT, as many as a player may have) */
    max: number;
    /** which: the first in the player's order (Gether 13. 10. 2026) or the best by score */
    order: MarchOrder;
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
    /** the points of each tier of the inscription tier list (Slim 13. 10. 2026: "Charge je na úrovni zlatej") */
    tiers: Record<InscriptionTier, number>;
    /** an inscription's tier by its name; one not listed counts by its colour (gold, blue, white above) */
    inscriptions: Record<string, InscriptionTier>;
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
    /**
     * primary, secondary, points (100 = a full meta pair); each order is its own row. A pair not in the table, or with
     * 0 points, and a march without a secondary are not evaluated at all (Slim 13. 10. 2026: "s tým nehrať"). Kept in
     * the database (guides.CommanderPair), saved with the variables but not in their JSON.
     */
    rows: PairRow[];
    /** the skill levels of both commanders (equal weight): the factor of 1111 and the curve */
    minimum: number;
    curve: number;
  };
  formations: {
    /**
     * commander → the formations a march he leads should use (Gether 14. 10. 2026, Slim: "nastaviť každého commandera,
     * akú má mať formáciu"); not listed = any. Kept in the database (guides.CommanderFormation) like the pairs, saved
     * with the variables but not in their JSON.
     */
    byCommander: Record<string, string[]>;
    /** the armaments of a march in another formation count × this */
    wrong: number;
  };
}

export type MarchOrder = 'position' | 'best';

/** a player has at most 10 marches (backend accounts MAX_MARCHES) */
export const MARCHES_LIMIT = 10;

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

export const INSCRIPTION_TIERS = ['S', 'A', 'B', 'C', 'D'] as const;
export type InscriptionTier = (typeof INSCRIPTION_TIERS)[number];

/** the best pair first – the table is sorted like this whenever it is loaded or saved (Slim 13. 10. 2026) */
export function sortPairs(rows: PairRow[]): PairRow[] {
  return [...rows].sort((a, b) => b[2] - a[2] || a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
}

const TIERS: Tier[] = [
  ['S+', 100], ['S', 99], ['S-', 98], ['A+', 95], ['A', 90], ['A-', 85], ['B+', 72], ['B', 68],
  ['B-', 58], ['C+', 52], ['C', 50], ['C-', 40], ['D+', 30], ['D', 25], ['D-', 20], ['F', 5],
].map(([tier, points]) => ({ tier: tier as string, points: points as number }));

/**
 * The inscription tier list for the open field (Slim 13. 10. 2026: "dal by som mu tier list inscriptions, charge je na
 * úrovni zlatej"). Sources: WarDaddyChadski with Davor – Delta, Pincer, Wedge tier lists (5.–15. 1. 2026), Special
 * Inscription Priority List (18. 1. 2026), Wedge 2.0 (31. 3. 2026), Pincer 2.0 (31. 7. 2026), Arch (28. 10. 2024);
 * Chisgule Gaming and DOM 117 on Pincer 2 / Charge (30.–31. 7. 2026); Mr Siege – V formation (26. 3. 2025).
 * Formations without a current source (Echelon, Tercio, Triple Line, Circle, Hollow Square) count by colour.
 */
export const DEFAULT_INSCRIPTIONS: Record<string, InscriptionTier> = Object.fromEntries(
  (
    [
      // Pincer
      ['S', 'Tidebreaker', 'Thundering', 'Dominate', 'Toppler', 'Cleaver', 'Demolisher'],
      ['A', 'Bulwark', 'Charge'],
      ['B', 'Airtight', 'Vigor', 'Rattling', 'Raider'],
      ['C', 'Imploder', 'Bludgeon', 'Bolstered'],
      ['D', 'Hardheaded'],
      // Delta
      ['S', 'Flurry', 'Thrasher', 'Steelskin', 'Butterfly Effect'],
      ['A', 'Causative'],
      ['B', 'Relentless', 'Pummeler'],
      ['C', 'Determined'],
      // Wedge
      ['S', 'Horseback Action', 'Advantage Advanced', 'Intrepid'],
      ['A', 'Indomitable', 'Hunter', 'Unstoppable'],
      ['B', 'Balanced', 'Maneuver at Ease', 'Divine Staff', 'Soar', 'Focus Fire', 'Boiling Blood'],
      ['C', 'Fury', 'Ballista', 'Crazed'],
      ['D', 'Defiant'],
      // Arch – Destructive and Battle-Ready do less than a common
      ['S', 'Fearless', 'Straight to the Point', 'Invincible'],
      ['B', 'Forceful', 'Even-Keeled'],
      ['C', 'Unswerving'],
      ['D', 'Destructive', 'Battle-Ready'],
      // V (siege)
      ['S', 'Astute', 'Drilled', 'Sharpshooter'],
      ['B', 'Sharp Arrows', 'Bloody Bolt'],
      ['C', 'Merciless', 'Full Draw'],
      // commons good on every march, and those with no use in the field (barbarians, cities, garrison)
      ['C', 'Assertive', 'Strategic', 'Robust', 'Fit', 'Vitality', 'Hardy'],
      ['D', 'Payback', 'Annexer', 'Pacifier', 'Cleanser', 'Siegework', 'Sentries', 'Vengeful', 'Patronage', 'Phalanx'],
    ] as [InscriptionTier, ...string[]][]
  ).flatMap(([tier, ...names]) => names.map((name) => [name, tier])),
);

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
  marches: {
    kinds: ['infantry', 'cavalry', 'archer', 'leadership', 'engineering'],
    max: 5,
    order: 'position',
    equipment: 0.75,
    armaments: 0.25,
  },
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
    tiers: { S: 50, A: 40, B: 30, C: 20, D: 5 },
    inscriptions: DEFAULT_INSCRIPTIONS,
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
    rows: [],
    minimum: 0.3,
    curve: 1.5,
  },
  formations: { byCommander: {}, wrong: 0.8 },
};

// ---------------------------------------------------------------- more marches than the spreadsheet's 5

/**
 * The power table for 1 … count marches. Rows the spreadsheet does not have (6 and more marches) go on from the
 * last one: the next power range starts where the last one ends and is as wide, the same for the score range – a
 * starting point, every value is editable. (The fund of the battle support went with the acclaim reached, Gether
 * 14. 10. 2026.)
 */
export function rowsFor(count: number, table: PowerRow[]): PowerRow[] {
  const rows = table.slice(0, count);
  while (rows.length < count) {
    const last = rows[rows.length - 1] ?? { min: 63, max: 66, scoreMin: 0, scoreMax: 40 };
    const width = Math.max(1, last.max - last.min);
    const scoreWidth = Math.max(1, last.scoreMax - last.scoreMin);
    rows.push({ min: last.max, max: last.max + width, scoreMin: last.scoreMax, scoreMax: last.scoreMax + scoreWidth });
  }
  return rows;
}

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
 * of a list) – something missing or wrong takes the default, keys the page does not know are dropped. The commander
 * pairs come from their own table in the database (guides.CommanderPair, Gether 13. 10. 2026), not from the JSON.
 */
export function normalizeSettings(value: unknown, pairRows: unknown = [], formationMap: unknown = {}): EvalSettings {
  const d = DEFAULT_SETTINGS;
  const raw = obj(value);
  const acclaim = obj(raw['acclaim']);
  const power = obj(raw['power']);
  const marches = obj(raw['marches']);
  const equipment = obj(raw['equipment']);
  const armaments = obj(raw['armaments']);
  const pairs = obj(raw['pairs']);
  const formations = obj(raw['formations']);
  const table = Array.isArray(power['table']) ? power['table'] : [];
  const tiers = Array.isArray(equipment['tiers']) ? equipment['tiers'] : [];
  const kinds = Array.isArray(marches['kinds']) ? marches['kinds'] : d.marches.kinds;
  const rows = Array.isArray(pairRows) ? pairRows : [];
  const player = acclaim['player'];
  const max = Math.round(num(marches['max'], d.marches.max, 1, MARCHES_LIMIT));
  // the saved rows of the power table, as many as the marches counted
  const sized = rowsFor(
    max,
    rowsFor(max, d.power.table).map((row, i) => group(table[i], row)),
  );
  const result: EvalSettings = {
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
      table: [],
      auto: typeof power['auto'] === 'boolean' ? power['auto'] : d.power.auto,
      low: num(power['low'], d.power.low, 0, 100),
      high: num(power['high'], d.power.high, 0, 100),
      samples: Math.round(num(power['samples'], d.power.samples, 2, 1000)),
    },
    marches: {
      kinds: MARCH_KINDS.filter((k) => kinds.includes(k)),
      max,
      order: marches['order'] === 'best' ? 'best' : 'position',
      equipment: num(marches['equipment'], d.marches.equipment, 0, 10),
      armaments: num(marches['armaments'], d.marches.armaments, 0, 10),
    },
    armaments: {
      ...group(armaments, {
        statsWeight: d.armaments.statsWeight,
        inscWeight: d.armaments.inscWeight,
        gold: d.armaments.gold,
        blue: d.armaments.blue,
        white: d.armaments.white,
      }),
      // divisors: never 0
      ...group(armaments, {
        attack: d.armaments.attack,
        defense: d.armaments.defense,
        health: d.armaments.health,
        damage: d.armaments.damage,
        combatMax: d.armaments.combatMax,
        inscMax: d.armaments.inscMax,
      }, 0.01),
      tiers: group(armaments['tiers'], d.armaments.tiers, 0, 1000),
      // saved before the tier list existed: the default tier list
      inscriptions: Object.fromEntries(
        Object.entries(obj(armaments['inscriptions'] ?? d.armaments.inscriptions)).filter(
          ([name, tier]) => !!name.trim() && INSCRIPTION_TIERS.includes(tier as InscriptionTier),
        ),
      ) as Record<string, InscriptionTier>,
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
      rows: sortPairs(
        uniquePairs(
          rows
            .filter((r): r is unknown[] => Array.isArray(r) && r.length === 3)
            .filter(([p, s, n]) => typeof p === 'string' && typeof s === 'string' && typeof n === 'number' && Number.isFinite(n))
            .map(([p, s, n]) => [(p as string).trim(), (s as string).trim(), Math.max(0, Math.min(500, n as number))] as PairRow)
            .filter(([p, s]) => !!p && !!s),
        ),
      ),
      minimum: num(pairs['minimum'], d.pairs.minimum, 0, 1),
      curve: num(pairs['curve'], d.pairs.curve, 0.1, 5),
    },
    formations: {
      byCommander: Object.fromEntries(
        Object.entries(obj(formationMap))
          .map(([name, ids]) => [name.trim(), Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string' && !!id).slice(0, 2) : []] as const)
          .filter(([name, ids]) => !!name && ids.length > 0)
          .sort(([a], [b]) => a.localeCompare(b)),
      ),
      wrong: num(formations['wrong'], d.formations.wrong, 0, 1),
    },
  };
  result.power.table = sized;
  return result;
}

/** a pair written twice: the first row counts (a row added on top is the newest) */
function uniquePairs(rows: PairRow[]): PairRow[] {
  const seen = new Set<string>();
  return rows.filter(([p, s]) => {
    const key = `${fold(p)}|${fold(s)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const RARITIES = ITEM_RARITIES;
export const SLOTS = GEAR_SLOTS;

/** what the server keeps: the variables as JSON, the pair table (rows filled in) and the formations as tables of their own */
export function toSave(settings: EvalSettings): { settings: unknown; pairs: PairRow[]; formations: Record<string, string[]> } {
  const { rows, ...pairs } = settings.pairs;
  const { byCommander, ...formations } = settings.formations;
  return {
    settings: { ...settings, pairs, formations },
    pairs: rows.filter(([p, s]) => !!p.trim() && !!s.trim()),
    formations: byCommander,
  };
}

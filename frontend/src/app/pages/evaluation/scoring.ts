import { ArmoryIndex, GEAR_SLOTS, buildOf, gearTotals, troopOf, troopStat } from '../../core/armory';
import { March } from '../../core/kvk-api';
import { fold } from '../../shared/search';
import { EvalSettings, PowerRow } from './settings';

/** a player as /api/evaluation/ sends them: the marches and what the superadmin wrote down */
export interface EvalPlayer {
  id: number;
  name: string;
  ingame_name: string;
  avatar_url: string;
  approved: boolean;
  marches: March[];
  /** millions, null = not written down */
  power: number | null;
  acclaim: number | null;
  t4: boolean;
  /** a correction of the recommended power, millions */
  power_bonus: number;
}

export type PairSource = 'table' | 'reversed' | 'unknown' | 'solo' | 'none';

export interface MarchEval {
  march: March;
  /** counts for the total: an open-field type and among the best */
  counted: boolean;
  /** why not: a type that does not count, or more marches than counted */
  skipped: 'kind' | 'limit' | null;
  pair: { points: number; source: PairSource };
  /** 1 = both commanders expertise */
  skills: number;
  armaments: { stats: number; inscriptions: number; points: number; filled: boolean };
  equipment: EquipmentEval;
  total: number;
}

export interface EquipmentEval {
  points: number;
  tier: string;
  /** pieces worn, legendary of them, refined (crit), the average iconic level of the legendary ones */
  pieces: number;
  legendary: number;
  crit: number;
  iconic: number;
  /** ATK + DEF + HP % of the march's troops */
  stats: number;
  /** the catalog is loaded – without it the pieces cannot be judged */
  known: boolean;
}

export interface PlayerEval {
  player: EvalPlayer;
  marches: MarchEval[];
  /** counted marches and their score */
  counted: number;
  marchScore: number;
  /** marches the power asks for (null = no power written down) and the missing ones counted on top */
  expected: number | null;
  missing: number;
  missingScore: number;
  /** the total score: the counted marches and the missing ones */
  score: number;
  /** the recommended power for the total score, and the most power the player's own marches carry */
  recommended: number | null;
  ownLimit: number | null;
  /** millions above the recommended power */
  excess: number;
  acclaim: { marches: number; excess: number; floor: number; t4: number; required: number };
  /** the acclaim reached / required, null = not written down */
  progress: number | null;
  /** what the player pays to the fund at this progress (null = acclaim not written down) */
  fund: number | null;
}

export interface Evaluation {
  rows: PlayerEval[];
  /** acclaim for one point of the score */
  perPoint: number;
  benchmarkScore: number;
  /** the score range of 1–5 marches used for the recommended power; auto = from the players */
  ranges: { min: number; max: number; auto: boolean; players: number }[];
}

// ---------------------------------------------------------------- one march

const pairKey = (primary: string, secondary: string) => `${fold(primary)}|${fold(secondary)}`;

export function pairTable(settings: EvalSettings): Map<string, number> {
  return new Map(settings.pairs.rows.map(([p, s, points]) => [pairKey(p, s), points]));
}

/** the points of the pair: from the table, the table the other way round, a solo commander or a pair not there */
export function pairPoints(settings: EvalSettings, table: Map<string, number>, march: March): MarchEval['pair'] {
  if (!march.primary) return { points: 0, source: 'none' };
  if (!march.secondary) return { points: settings.pairs.solo, source: 'solo' };
  const direct = table.get(pairKey(march.primary, march.secondary));
  if (direct !== undefined) return { points: direct, source: 'table' };
  const reversed = table.get(pairKey(march.secondary, march.primary));
  if (reversed !== undefined) return { points: reversed * settings.pairs.reversed, source: 'reversed' };
  return { points: settings.pairs.unknown, source: 'unknown' };
}

/** 0 at 1111, 1 at 5555 (expertise) */
const readiness = (skills: string | undefined) => {
  const levels = (skills ?? '5555').split('').map(Number);
  return levels.length === 4 && levels.every((l) => l >= 1 && l <= 5) ? (levels.reduce((a, b) => a + b, 0) - 4) / 16 : 1;
};

/**
 * The skill levels of the pair as a factor (the spreadsheet scored unfinished commanders about a third of the full
 * pair): the primary weighs more; minimum + (1 − minimum) × readiness^curve.
 */
export function skillFactor(settings: EvalSettings, march: March): number {
  const p = settings.pairs;
  const wp = p.primary;
  const ws = march.secondary ? p.secondary : 0;
  const ready = wp + ws > 0 ? (wp * readiness(march.primary_skills) + ws * readiness(march.secondary_skills)) / (wp + ws) : 1;
  return p.minimum + (1 - p.minimum) * Math.pow(ready, p.curve);
}

/** the spreadsheet's armament points: the bonuses over their best, the inscriptions by colour over their best */
export function armamentPoints(settings: EvalSettings, march: March): MarchEval['armaments'] {
  const a = settings.armaments;
  const v = (n: number | null | undefined) => n ?? 0;
  const bonuses = v(march.attack) / a.attack + v(march.defense) / a.defense + v(march.health) / a.health + v(march.damage) / a.damage;
  const stats = (bonuses / a.combatMax) * a.statsWeight;
  const inscriptions = ((v(march.gold) * a.gold + v(march.blue) * a.blue + v(march.white) * a.white) / a.inscMax) * a.inscWeight;
  const filled = [march.attack, march.defense, march.health, march.gold, march.blue, march.white].some((n) => (n ?? 0) > 0);
  return { stats, inscriptions, points: stats + inscriptions, filled };
}

/** the tier of the spreadsheet a score reaches */
export function tierOf(settings: EvalSettings, points: number): string {
  const tiers = [...settings.equipment.tiers].sort((a, b) => b.points - a.points);
  return tiers.find((t) => points >= t.points - 1e-9)?.tier ?? tiers[tiers.length - 1]?.tier ?? '';
}

/**
 * The equipment in points instead of the tier judged by eye: each slot its rarity, + the crit (refine), + its iconic
 * level, weighted by the slots; optionally blended with the real ATK + DEF + HP % it gives the march's troops.
 */
export function equipmentPoints(settings: EvalSettings, march: March, index: ArmoryIndex | null): EquipmentEval {
  const e = settings.equipment;
  const gear = buildOf(march).gear;
  let sum = 0;
  let weights = 0;
  let pieces = 0;
  let legendary = 0;
  let crit = 0;
  let iconic = 0;
  for (const slot of GEAR_SLOTS) {
    const weight = e.slots[slot];
    weights += weight;
    const piece = gear[slot];
    const item = piece && index?.items.get(piece.item);
    if (!piece || !item) continue;
    pieces++;
    if (item.rarity === 'legendary') {
      legendary++;
      iconic += piece.iconic;
    }
    if (piece.crit) crit++;
    const level = item.iconic ? Math.min(5, Math.max(0, piece.iconic)) : 0;
    sum += weight * (e.base[item.rarity] + (piece.crit ? e.crit[item.rarity] : 0) + (level ? e.iconic[level - 1] : 0));
  }
  const tierScore = weights > 0 ? sum / weights : 0;
  let stats = 0;
  if (index) {
    const totals = gearTotals(index, gear).stats;
    const troop = troopOf(march.kind, totals);
    stats = troopStat(totals, troop, 'attack') + troopStat(totals, troop, 'defense') + troopStat(totals, troop, 'health');
  }
  const statScore = Math.min(1, stats / e.statsMax) * 100;
  const points = tierScore * (1 - e.statsWeight) + statScore * e.statsWeight;
  return {
    points,
    tier: pieces ? tierOf(settings, points) : '',
    pieces,
    legendary,
    crit,
    iconic: legendary ? iconic / legendary : 0,
    stats,
    known: !!index,
  };
}

/** a march in the spreadsheet's formula: (equipment × weight + armaments × weight) × pair / 100 × skills */
export function marchEval(settings: EvalSettings, table: Map<string, number>, march: March, index: ArmoryIndex | null): MarchEval {
  const pair = pairPoints(settings, table, march);
  const skills = skillFactor(settings, march);
  const armaments = armamentPoints(settings, march);
  const equipment = equipmentPoints(settings, march, index);
  const m = settings.marches;
  const total = (equipment.points * m.equipment + armaments.points * m.armaments) * (pair.points / 100) * skills;
  return { march, counted: false, skipped: null, pair, skills, armaments, equipment, total };
}

// ---------------------------------------------------------------- power

/** PERCENTILE of the spreadsheet (inclusive, linear between the values) */
export function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (Math.min(100, Math.max(0, p)) / 100) * (sorted.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  return sorted[low] + (sorted[high] - sorted[low]) * (rank - low);
}

/** how many marches a power asks for: the most whose lowest power it reaches (at least 1) */
export function expectedMarches(settings: EvalSettings, power: number): number {
  let expected = 1;
  settings.power.table.forEach((row, i) => {
    if (i < settings.marches.max && power >= row.min) expected = i + 1;
  });
  return expected;
}

/** the spreadsheet's recommended power: the range of the march count, spread over its score range */
export function recommendedPower(row: PowerRow, range: { min: number; max: number }, score: number, bonus: number): number {
  const t = range.max > range.min ? Math.min(1, Math.max(0, (score - range.min) / (range.max - range.min))) : 0;
  return Math.round(row.min + t * (row.max - row.min) + bonus);
}

// ---------------------------------------------------------------- everyone

interface Draft {
  player: EvalPlayer;
  marches: MarchEval[];
  counted: number;
  marchScore: number;
  expected: number | null;
  missing: number;
  missingScore: number;
  score: number;
  /** the march count the power table is read for */
  group: number;
}

/**
 * Every player: the march scores, the total with the marches their power asks for, the recommended power, the
 * required acclaim (score × the benchmark's acclaim per point + the excess power, at least the power floor and the
 * minimum, T4 less), the progress and the fund. The score ranges of the power table come from the players when a
 * group has enough of them (the spreadsheet did the same from its own results).
 */
export function evaluate(settings: EvalSettings, players: EvalPlayer[], index: ArmoryIndex | null, usePower = true): Evaluation {
  // "Rátať s power" off (Gether 13. 10. 2026): the estimate from the marches only, the power written down stays
  const powerOf = (player: EvalPlayer) => (usePower ? player.power : null);
  const table = pairTable(settings);
  const kinds = new Set(settings.marches.kinds);
  const p = settings.power;

  const partial: Draft[] = players.map((player) => {
    const marches = player.marches.map((m) => marchEval(settings, table, m, index));
    const eligible = marches.filter((m) => m.march.kind && kinds.has(m.march.kind)).sort((a, b) => b.total - a.total);
    eligible.forEach((m, i) => {
      m.counted = i < settings.marches.max;
      m.skipped = m.counted ? null : 'limit';
    });
    marches.forEach((m) => {
      if (!m.counted && !m.skipped) m.skipped = 'kind';
    });
    const counted = eligible.filter((m) => m.counted);
    const marchScore = counted.reduce((sum, m) => sum + m.total, 0);
    const power = powerOf(player);
    const expected = power !== null && p.expected ? expectedMarches(settings, power) : null;
    const missing = expected !== null ? Math.max(0, expected - counted.length) : 0;
    const missingScore = counted.length ? (marchScore / counted.length) * (p.phantom / 100) : p.emptyMarch;
    const score = marchScore + missing * missingScore;
    const group = Math.min(settings.marches.max, Math.max(counted.length, expected ?? 0));
    sortMarches(marches);
    return { player, marches, counted: counted.length, marchScore, expected, missing, missingScore, score, group };
  });

  // the score ranges of 1–5 marches: percentiles of the approved players with that many (counted or expected)
  const ranges = p.table.map((row, i) => {
    const scores = partial.filter((x) => x.player.approved && x.group === i + 1 && x.score > 0).map((x) => x.score);
    const auto = p.auto && scores.length >= p.samples;
    return auto
      ? { min: percentile(scores, p.low), max: percentile(scores, p.high), auto, players: scores.length }
      : { min: row.scoreMin, max: row.scoreMax, auto, players: scores.length };
  });

  const benchmark = settings.acclaim.player !== null ? partial.find((x) => x.player.id === settings.acclaim.player) : undefined;
  const benchmarkScore = benchmark && benchmark.score > 0 ? benchmark.score : settings.acclaim.score;
  const perPoint = settings.acclaim.benchmark / benchmarkScore;

  const rows = partial.map((x): PlayerEval => {
    const power = powerOf(x.player);
    const row = x.group ? p.table[x.group - 1] : null;
    const recommended = row ? recommendedPower(row, ranges[x.group - 1], x.score, x.player.power_bonus) : null;
    // the most power the player's own marches carry: their count and score, nothing missing added
    const own = Math.min(settings.marches.max, x.counted);
    const ownLimit = own ? recommendedPower(p.table[own - 1], ranges[own - 1], x.marchScore, x.player.power_bonus) : null;
    const excess = power !== null && recommended !== null ? Math.max(0, power - recommended) : 0;
    const marches = x.score * perPoint;
    const excessAcclaim = excess * p.excess;
    const floor = power !== null ? power * p.floor : 0;
    const base = Math.max(marches + excessAcclaim, floor);
    const t4 = x.player.t4 ? base * (settings.acclaim.t4 / 100) : 0;
    const step = settings.acclaim.round;
    const required = Math.max(settings.acclaim.minimum, Math.round((base - t4) / step) * step);
    const progress = x.player.acclaim !== null && required > 0 ? x.player.acclaim / required : null;
    const fundMax = settings.fund.max[Math.max(1, x.group) - 1] ?? 0;
    const fund = progress !== null ? fundMax * Math.max(0, 1 - progress) : null;
    return {
      player: x.player,
      marches: x.marches,
      counted: x.counted,
      marchScore: x.marchScore,
      expected: x.expected,
      missing: x.missing,
      missingScore: x.missingScore,
      score: x.score,
      recommended,
      ownLimit,
      excess,
      acclaim: { marches, excess: excessAcclaim, floor, t4, required },
      progress,
      fund,
    };
  });
  return { rows, perPoint, benchmarkScore, ranges };
}

/** the counted marches first, the best on top, then the others in their order */
function sortMarches(marches: MarchEval[]): void {
  marches.sort((a, b) => Number(b.counted) - Number(a.counted) || (a.counted ? b.total - a.total : a.march.position - b.march.position));
}

/** the commander pairs the players use that are not in the table, the most used first */
export function missingPairs(settings: EvalSettings, players: EvalPlayer[]): { primary: string; secondary: string; players: number }[] {
  const table = pairTable(settings);
  const kinds = new Set(settings.marches.kinds);
  const found = new Map<string, { primary: string; secondary: string; who: Set<number> }>();
  for (const player of players) {
    for (const m of player.marches) {
      if (!m.primary || !m.secondary || !m.kind || !kinds.has(m.kind)) continue;
      if (table.has(pairKey(m.primary, m.secondary))) continue;
      const key = pairKey(m.primary, m.secondary);
      const entry = found.get(key) ?? { primary: m.primary, secondary: m.secondary, who: new Set<number>() };
      entry.who.add(player.id);
      found.set(key, entry);
    }
  }
  return [...found.values()]
    .map((e) => ({ primary: e.primary, secondary: e.secondary, players: e.who.size }))
    .sort((a, b) => b.players - a.players || a.primary.localeCompare(b.primary));
}

/**
 * The power of many players pasted at once, one per line: a name and the power in millions ("Gether 101,5",
 * "Gether;101.5", "Gether: 101 M"; a full number like 101 500 000 is read as millions). A name matches the in-game
 * name or the Discord name, without case and diacritics; a line not understood or matching nobody (or more players)
 * comes back as it was.
 */
export function parsePowerList(text: string, players: EvalPlayer[]): { found: { id: number; power: number }[]; unknown: string[] } {
  const found = new Map<number, number>();
  const unknown: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    // the name, a separator, the number last (thousands may be split by spaces: 101 500 000)
    const match = /^(.+?)[\s;:,=]+(\d{1,3}(?:[  ]\d{3})+|\d+(?:[.,]\d+)?)\s*(?:m|mil\.?)?$/i.exec(line);
    const name = match?.[1].trim() ?? '';
    let power = match ? Number(match[2].replace(/\s/g, '').replace(',', '.')) : NaN;
    if (!name || !Number.isFinite(power)) {
      unknown.push(line);
      continue;
    }
    if (power >= 100_000) power /= 1_000_000;
    const who = fold(name);
    const hits = players.filter((p) => fold(p.ingame_name) === who || fold(p.name) === who);
    if (hits.length !== 1) {
      unknown.push(line);
      continue;
    }
    found.set(hits[0].id, Math.round(power * 10) / 10);
  }
  return { found: [...found].map(([id, power]) => ({ id, power })), unknown };
}

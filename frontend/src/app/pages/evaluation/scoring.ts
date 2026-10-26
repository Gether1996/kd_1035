import { ArmoryIndex, GEAR_SLOTS, Inscription, buildOf, gearTotals, troopOf, troopStat } from '../../core/armory';
import { ARMAMENT_CAPS, ArmamentStat, March, overCaps } from '../../core/kvk-api';
import { fold } from '../../shared/search';
import { EvalSettings } from './settings';

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
  t4: boolean;
  /** a correction of the recommended power, millions */
  power_bonus: number;
}

/** from the table; not there, without a secondary or without a commander = not evaluated */
export type PairSource = 'table' | 'unknown' | 'solo' | 'none';

export interface MarchEval {
  march: March;
  /** counts for the total: an open-field type and among the best */
  counted: boolean;
  /** why not: a type that does not count, a pair not evaluated, or more marches than counted */
  skipped: 'kind' | 'pair' | 'limit' | null;
  pair: { points: number; source: PairSource };
  /** 1 = both commanders expertise */
  skills: number;
  /** tiered: the inscriptions clicked together scored by the tier list (else the counts by colour); points after the
   * formation factor */
  armaments: { stats: number; inscriptions: number; points: number; filled: boolean; tiered: boolean };
  /** the formations the primary commander should use; ok = null when he has none set or the march has no formation */
  formation: { preferred: string[]; ok: boolean | null };
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
  /** marches the power asks for (null = no power written down) and how many of them the player has not clicked */
  expected: number | null;
  missing: number;
  /** the score of the counted marches (their sum) and the average march – the quality */
  score: number;
  quality: number;
  /**
   * The power the player's own counted marches carry – the power table's row of their count, the same for everyone
   * with that many (Gether 26. 10. 2026) plus the player's own correction; both the same number, `recommended` kept for
   * the published overview
   */
  recommended: number | null;
  ownLimit: number | null;
  /** the power the acclaim counts with: the one written down, else the recommended one (null = neither) */
  power: number | null;
  /** millions above the recommended power (shown, the quick filter "Nad odp. power") */
  excess: number;
  /** the marches the acclaim counts with: the counted ones and the missing ones the power asks for, up to the max */
  marchCount: number;
  /**
   * The benchmark's acclaim × the three factors, multiplied (Gether 24. 10. 2026: strong marches never make up for
   * missing ones or less power): (power / the benchmark's)^curve, (marches / the full number)^curve and the quality
   * within ± its band; + the surcharge for the power above what those marches carry (surplus, M); then T4 less
   */
  acclaim: { power: number; marches: number; quality: number; surplus: number; surcharge: number; t4: number; required: number };
}

export interface Evaluation {
  rows: PlayerEval[];
  /** the benchmark the parts are measured against: its power, the full number of marches and its average march */
  benchmark: { power: number; marches: number; quality: number };
}

// ---------------------------------------------------------------- one march

/** commander (folded) → the formations a march he leads should use */
export function formationTable(settings: EvalSettings): Map<string, string[]> {
  return new Map(Object.entries(settings.formations.byCommander).map(([name, ids]) => [fold(name), ids]));
}

/**
 * Does the march use a formation its primary commander should lead with (Gether 14. 10. 2026, Slim: "nastaviť
 * každého commandera, akú má mať formáciu")? A commander without one set takes any.
 */
export function formationOf(formations: Map<string, string[]>, march: March): MarchEval['formation'] {
  const preferred = formations.get(fold(march.primary)) ?? [];
  const ok = !preferred.length || !march.formation ? null : preferred.includes(march.formation);
  return { preferred, ok };
}

export const pairKey = (primary: string, secondary: string) => `${fold(primary)}|${fold(secondary)}`;

/** each order of a pair is its own row; a pair written twice: the first row counts */
export function pairTable(settings: EvalSettings): Map<string, number> {
  const table = new Map<string, number>();
  for (const [p, s, points] of settings.pairs.rows) {
    const key = pairKey(p, s);
    if (!table.has(key)) table.set(key, points);
  }
  return table;
}

/**
 * The points of the pair from the table, in this order exactly (Slim 13. 10. 2026: the other order is a row of its
 * own – "achilles ivan je lepší ivan achilles": Ivan IV first is the better one). A pair not there and a march
 * without a secondary score 0 – such a march is not evaluated at all ("s tým nehrať", "marchku bez secondary ani
 * akceptovať nebudeme").
 */
export function pairPoints(table: Map<string, number>, march: March): MarchEval['pair'] {
  if (!march.primary) return { points: 0, source: 'none' };
  if (!march.secondary) return { points: 0, source: 'solo' };
  const points = table.get(pairKey(march.primary, march.secondary));
  return points === undefined ? { points: 0, source: 'unknown' } : { points, source: 'table' };
}

/** 0 at 1111, 1 at 5555 (expertise) */
const readiness = (skills: string | undefined) => {
  const levels = (skills ?? '5555').split('').map(Number);
  return levels.length === 4 && levels.every((l) => l >= 1 && l <= 5) ? (levels.reduce((a, b) => a + b, 0) - 4) / 16 : 1;
};

/**
 * The skill levels of the pair as a factor (the spreadsheet scored unfinished commanders about a third of the full
 * pair): both commanders weigh the same (Slim 13. 10. 2026: "váha skillov primary alebo secondary je zlá");
 * minimum + (1 − minimum) × readiness^curve.
 */
export function skillFactor(settings: EvalSettings, march: March): number {
  const p = settings.pairs;
  const ready = march.secondary ? (readiness(march.primary_skills) + readiness(march.secondary_skills)) / 2 : readiness(march.primary_skills);
  return p.minimum + (1 - p.minimum) * Math.pow(ready, p.curve);
}

/** the points of one inscription: its tier in the tier list, else its colour */
export function inscriptionValue(settings: EvalSettings, inscription: Pick<Inscription, 'name' | 'rarity'>): number {
  const a = settings.armaments;
  const tier = a.inscriptions[inscription.name];
  if (tier) return a.tiers[tier];
  return inscription.rarity === 'special' ? a.gold : inscription.rarity === 'rare' ? a.blue : a.white;
}

/**
 * The spreadsheet's armament points: the bonuses over their best, the inscriptions over their best – the ones clicked
 * together by the tier list (Slim 13. 10. 2026), the counts typed in before by colour. A bonus over its cap is a typo
 * and counts as the cap (ARMAMENT_CAPS, Gether 19. 10. 2026).
 */
export function armamentPoints(settings: EvalSettings, march: March, index: ArmoryIndex | null = null): MarchEval['armaments'] {
  const a = settings.armaments;
  const v = (n: number | null | undefined) => n ?? 0;
  const c = (stat: ArmamentStat) => Math.min(v(march[stat]), ARMAMENT_CAPS[stat]);
  const bonuses = c('attack') / a.attack + c('defense') / a.defense + c('health') / a.health + c('damage') / a.damage;
  const stats = (bonuses / a.combatMax) * a.statsWeight;
  const clicked = index ? (march.inscriptions ?? []).map((id) => index.inscriptions.get(id)).filter((i) => !!i) : [];
  const tiered = clicked.length > 0;
  const raw = tiered
    ? clicked.reduce((sum, i) => sum + inscriptionValue(settings, i), 0)
    : v(march.gold) * a.gold + v(march.blue) * a.blue + v(march.white) * a.white;
  const inscriptions = (raw / a.inscMax) * a.inscWeight;
  const filled = tiered || [march.attack, march.defense, march.health, march.gold, march.blue, march.white].some((n) => (n ?? 0) > 0);
  return { stats, inscriptions, points: stats + inscriptions, filled, tiered };
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

/**
 * a march in the spreadsheet's formula: (equipment × weight + armaments × weight) × pair / 100 × skills; the armaments
 * of a march in a formation its primary commander should not use × the variable "iná formácia"
 */
export function marchEval(
  settings: EvalSettings,
  table: Map<string, number>,
  march: March,
  index: ArmoryIndex | null,
  formations: Map<string, string[]> = formationTable(settings),
): MarchEval {
  const pair = pairPoints(table, march);
  const skills = skillFactor(settings, march);
  const formation = formationOf(formations, march);
  const raw = armamentPoints(settings, march, index);
  const armaments = { ...raw, points: raw.points * (formation.ok === false ? settings.formations.wrong : 1) };
  const equipment = equipmentPoints(settings, march, index);
  const m = settings.marches;
  const total = (equipment.points * m.equipment + armaments.points * m.armaments) * (pair.points / 100) * skills;
  return { march, counted: false, skipped: null, pair, skills, armaments, formation, equipment, total };
}

// ---------------------------------------------------------------- power

/** how many marches a power asks for: the fewest whose recommended power carries it (more than all of them = the max) */
export function expectedMarches(settings: EvalSettings, power: number): number {
  const rows = settings.power.table.slice(0, settings.marches.max);
  const n = rows.findIndex((carried) => power <= carried + 1e-9);
  return n < 0 ? Math.max(1, rows.length) : n + 1;
}

/**
 * The recommended power of a march count: its row of the power table, the same for everyone with that many marches
 * (Gether 26. 10. 2026: "niekto má 5 marchov a iný má 5 marchov, ale odporúčaná power je iná") – plus the player's
 * own correction set by the leadership
 */
export function recommendedPower(settings: EvalSettings, count: number, bonus = 0): number | null {
  const n = Math.min(settings.marches.max, count);
  return n > 0 ? Math.round(settings.power.table[n - 1] + bonus) : null;
}

/** (power / the benchmark's power)^curve – what the acclaim a power can reach is against the benchmark's */
export function powerFactor(settings: EvalSettings, power: number, benchmarkPower: number): number {
  return benchmarkPower > 0 ? Math.pow(Math.max(0, power) / benchmarkPower, settings.acclaim.powerCurve) : 0;
}

/** (marches / the full number)^curve */
export function marchFactor(settings: EvalSettings, count: number): number {
  const max = settings.marches.max;
  return max > 0 ? Math.pow(Math.min(max, Math.max(0, count)) / max, settings.acclaim.marchCurve) : 0;
}

// ---------------------------------------------------------------- everyone

interface Draft {
  player: EvalPlayer;
  marches: MarchEval[];
  counted: number;
  marchScore: number;
  expected: number | null;
  missing: number;
}

/**
 * Every player: the best counted marches, the recommended power their count carries (the same for everyone with that
 * many), and the required acclaim = the benchmark's acclaim ×
 *   (power / the benchmark's power)^powerCurve,
 *   (marches / the full number)^marchCurve – the marches the power asks for count as there (a high power with few
 *   marches is the player's fault, Gether 24. 10. 2026),
 *   the quality factor (the average march against the benchmark's, within ± qualityBand %),
 * + power.surplus for each million above the recommended power of those marches – the power not even the full number
 * of marches carries (Gether 26. 10. 2026: "SKAPALS a Maros … majú zbytočne 170 M power, ktorú treba znížiť"),
 * T4 less, at least the minimum. Multiplied, so the quality never makes up for missing marches or less power.
 *
 * Why curves (Gether 26. 10. 2026: "T4 hráč s jedným marchom a 40 M power má taký vysoký acclaim, len o trochu nižší
 * ako hráči nad ním s viacerými marchami a T5 … čo najviac fér"): in the last KvK the acclaim the players reached grew
 * like power^1.35 × marches^0.8 (57 players of the spreadsheet). A straight line with every power under 60 M counted as
 * 60 M asked the small accounts for four times what they reached and the big ones for half; with the curves the
 * reached / required is about the same at every size. Without a power written down the recommended power stands in.
 */
export function evaluate(settings: EvalSettings, players: EvalPlayer[], index: ArmoryIndex | null, usePower = true): Evaluation {
  // "Rátať s power" off (Gether 13. 10. 2026): the estimate from the marches only, the power written down stays
  const powerOf = (player: EvalPlayer) => (usePower ? player.power : null);
  const table = pairTable(settings);
  const formations = formationTable(settings);
  const kinds = new Set(settings.marches.kinds);
  const p = settings.power;
  const max = settings.marches.max;

  const partial: Draft[] = players.map((player) => {
    const marches = player.marches.map((m) => marchEval(settings, table, m, index, formations));
    // the best X by score, whatever their place in the player's order (Gether 16. 10. 2026: "prvých 5 najsilnejších,
    // aby to nebolo také, že keď je 7. vyplnený najsilnejší, tak sa skipne"); a tie goes to the player's order
    const byPosition = (a: MarchEval, b: MarchEval) => a.march.position - b.march.position || a.march.id - b.march.id;
    // a march whose pair is not evaluated takes no place – the next one counts instead
    const eligible = marches
      .filter((m) => m.march.kind && kinds.has(m.march.kind) && m.pair.points > 0)
      .sort((a, b) => b.total - a.total || byPosition(a, b));
    eligible.forEach((m, i) => {
      m.counted = i < max;
      m.skipped = m.counted ? null : 'limit';
    });
    marches.forEach((m) => {
      if (!m.counted && !m.skipped) m.skipped = m.march.kind && kinds.has(m.march.kind) ? 'pair' : 'kind';
    });
    const counted = eligible.filter((m) => m.counted);
    const marchScore = counted.reduce((sum, m) => sum + m.total, 0);
    const power = powerOf(player);
    const expected = power !== null && p.expected ? expectedMarches(settings, power) : null;
    const missing = expected !== null ? Math.max(0, expected - counted.length) : 0;
    sortMarches(marches);
    return { player, marches, counted: counted.length, marchScore, expected, missing };
  });

  // the benchmark: the picked player's average march and power, else the numbers of the variables
  const a = settings.acclaim;
  const picked = a.player !== null ? partial.find((x) => x.player.id === a.player && x.counted > 0) : undefined;
  const benchmark = {
    power: (picked && picked.player.power) || a.power,
    marches: max,
    quality: picked ? picked.marchScore / picked.counted : a.score / max,
  };
  const band = a.qualityBand / 100;

  const rows = partial.map((x): PlayerEval => {
    const recommended = recommendedPower(settings, x.counted, x.player.power_bonus);
    const written = powerOf(x.player);
    const power = written ?? recommended;
    const quality = x.counted ? x.marchScore / x.counted : 0;
    // the marches the power asks for count as there (Gether 24. 10. 2026: "človek so 100 M power má len 2 marche, čo je
    // jeho chyba") – only a low power with few marches owes less
    const marchCount = Math.min(max, x.counted + x.missing);
    const factors = {
      power: power !== null ? powerFactor(settings, power, benchmark.power) : 0,
      marches: marchFactor(settings, marchCount),
      quality: benchmark.quality > 0 ? Math.min(1 + band, Math.max(1 - band, 1 + band * (quality / benchmark.quality - 1))) : 1,
    };
    const excess = written !== null && recommended !== null ? Math.max(0, written - recommended) : 0;
    // the power above what the marches counted with the missing ones carry: with the missing ones counted only the
    // power over the full number's row (unless the leadership corrected the player's recommended power)
    const carried = recommendedPower(settings, marchCount, x.player.power_bonus);
    const surplus = power !== null && carried !== null ? Math.max(0, power - carried) : 0;
    const surcharge = surplus * p.surplus;
    const sum = a.benchmark * factors.power * factors.marches * factors.quality + surcharge;
    const t4 = x.player.t4 ? sum * (a.t4 / 100) : 0;
    const step = a.round;
    const required = Math.max(a.minimum, Math.round((sum - t4) / step) * step);
    return {
      player: x.player,
      marches: x.marches,
      counted: x.counted,
      marchScore: x.marchScore,
      expected: x.expected,
      missing: x.missing,
      score: x.marchScore,
      quality,
      recommended,
      ownLimit: recommended,
      power,
      excess,
      marchCount,
      acclaim: { ...factors, surplus, surcharge, t4, required },
    };
  });
  return { rows, benchmark };
}

/** in the player's order, as on /marche */
function sortMarches(marches: MarchEval[]): void {
  marches.sort((a, b) => a.march.position - b.march.position || a.march.id - b.march.id);
}

export interface MissingPair {
  primary: string;
  secondary: string;
  /** how many players have it */
  players: number;
  /** the points of the other order when that one is in the table */
  reversed: number | null;
}

/** the commander pairs the players use that are not in the table (in this order), the most used first */
export function missingPairs(settings: EvalSettings, players: EvalPlayer[]): MissingPair[] {
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
    .map((e) => ({
      primary: e.primary,
      secondary: e.secondary,
      players: e.who.size,
      reversed: table.get(pairKey(e.secondary, e.primary)) ?? null,
    }))
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

// ---------------------------------------------------------------- quick filters of the table

/** "Na opravu", "Bez power" and "Nad odp. power" of the table – a to-do list before KvK */
export type QuickFilter = 'all' | 'fix' | 'nopower' | 'over';
export const QUICK_FILTERS: readonly QuickFilter[] = ['all', 'fix', 'nopower', 'over'];
/** hidden with "Rátať s power" off */
export const POWER_FILTERS: ReadonlySet<string> = new Set<QuickFilter>(['nopower', 'over']);

/**
 * A march the player should change: a pair not evaluated (solo or not in the table – both skipped as 'pair'), a
 * formation its primary commander should not lead with or an armament bonus over its cap (any type, like /marche).
 * Counted from the evaluation, not from marchHasProblem() of the server: the table counts with the Premenné being
 * edited, unsaved ones too, and the filter has to agree with it. Not a type that does not count ('kind'), nor a march
 * over the max ('limit') by itself – the player cannot fix either by changing commanders; a march over the max in a
 * wrong formation is one (/marche says so as well).
 */
export function marchToFix(m: MarchEval): boolean {
  return m.skipped === 'pair' || (m.skipped !== 'kind' && m.formation.ok === false) || overCaps(m.march).length > 0;
}

/** more power than the player's own counted marches carry ("Odp. power" in red) */
export function overLimit(r: PlayerEval): boolean {
  const power = r.player.power;
  return power !== null && r.ownLimit !== null && power > r.ownLimit;
}

export function quickMatch(filter: QuickFilter, r: PlayerEval): boolean {
  switch (filter) {
    case 'fix':
      return r.marches.some(marchToFix);
    case 'nopower':
      return r.player.power === null;
    case 'over':
      return overLimit(r);
    default:
      return true;
  }
}

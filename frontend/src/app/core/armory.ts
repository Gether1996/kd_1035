import { isPlatformBrowser } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { March, MarchKind } from './kvk-api';

/** the march's equipment slots in the order of the card and the editor (backend guides/armory.py MARCH_SLOTS) */
export const GEAR_SLOTS = ['weapon', 'helmet', 'chest', 'gloves', 'legs', 'boots', 'accessory1', 'accessory2'] as const;
export type GearSlot = (typeof GEAR_SLOTS)[number];
export type ItemSlot = Exclude<GearSlot, 'accessory1' | 'accessory2'> | 'accessory';
export const ITEM_RARITIES = ['legendary', 'epic', 'elite', 'advanced', 'common'] as const;
export type ItemRarity = (typeof ITEM_RARITIES)[number];
export const ICONIC_MAX = 5;
export const MAX_INSCRIPTIONS = 12;

export const ARMAMENT_PIECES = ['emblem', 'flag', 'instrument', 'scroll'] as const;
export type ArmamentPiece = (typeof ARMAMENT_PIECES)[number];
/** gold, blue and white in the game */
export const INSCRIPTION_RARITIES = ['special', 'rare', 'common'] as const;
export type InscriptionRarity = (typeof INSCRIPTION_RARITIES)[number];

export interface ArmoryItem {
  id: string;
  name: string;
  slot: ItemSlot;
  rarity: ItemRarity;
  /** "cavalry_attack": 25 … in percent; troop_* counts for every troop type */
  stats: Record<string, number>;
  /** the stats with a crit (special talent) */
  crit: Record<string, number>;
  /** gathering speed and the like, the game's English text */
  extra?: string[];
  extra_crit?: string[];
  /** can be awakened (iconic I–V) */
  iconic?: boolean;
  set?: string;
  icon: string;
}

export interface ArmorySet {
  id: string;
  name: string;
  pieces: string[];
  bonuses: { count: number; text: string; stats: Record<string, number> }[];
}

export interface Inscription {
  id: string;
  name: string;
  rarity: InscriptionRarity;
  piece: ArmamentPiece;
}

export interface Formation {
  id: string;
  name: string;
  /** /static/guides/formations/<id>.webp, '' = none (the initials stand for it) */
  icon: string;
  inscriptions: Inscription[];
}

/** /api/armory/ (backend guides/armory.py) */
export interface ArmoryData {
  /** 'RRRR-MM' */
  verified: string;
  sources: string[];
  items: ArmoryItem[];
  sets: ArmorySet[];
  formations: Formation[];
  common: Inscription[];
}

export interface GearPiece {
  item: string;
  crit: boolean;
  /** 0 = not awakened */
  iconic: number;
}
export type Gear = Partial<Record<GearSlot, GearPiece>>;

/** the build of a march (March.gear, formation, inscriptions) */
export interface Build {
  gear: Gear;
  formation: string;
  inscriptions: string[];
}

export function buildOf(march: Pick<March, 'gear' | 'formation' | 'inscriptions'>): Build {
  return { gear: march.gear ?? {}, formation: march.formation ?? '', inscriptions: march.inscriptions ?? [] };
}

export function hasBuild(march: Pick<March, 'gear' | 'formation' | 'inscriptions'>): boolean {
  const build = buildOf(march);
  return Object.keys(build.gear).length > 0 || !!build.formation || build.inscriptions.length > 0;
}

export function itemSlot(slot: GearSlot): ItemSlot {
  return slot.startsWith('accessory') ? 'accessory' : (slot as ItemSlot);
}

/** the catalog looked up by id */
export interface ArmoryIndex {
  data: ArmoryData;
  items: Map<string, ArmoryItem>;
  sets: Map<string, ArmorySet>;
  formations: Map<string, Formation>;
  inscriptions: Map<string, Inscription>;
}

export function armoryIndex(data: ArmoryData): ArmoryIndex {
  return {
    data,
    items: new Map(data.items.map((i) => [i.id, i])),
    sets: new Map(data.sets.map((s) => [s.id, s])),
    formations: new Map(data.formations.map((f) => [f.id, f])),
    inscriptions: new Map([...data.formations.flatMap((f) => f.inscriptions), ...data.common].map((i) => [i.id, i])),
  };
}

// ---------------------------------------------------------------- stats

export const TROOPS = ['infantry', 'cavalry', 'archer', 'siege'] as const;
export type Troop = (typeof TROOPS)[number];
export const TROOP_STATS = ['attack', 'defense', 'health', 'march_speed'] as const;
export type TroopStat = (typeof TROOP_STATS)[number];

export interface ActiveSet {
  set: ArmorySet;
  /** pieces worn */
  count: number;
  /** the bonuses it reached */
  bonuses: ArmorySet['bonuses'];
}

/** Every stat of the worn items (with their crits) and the set bonuses they reach, summed by key. */
export function gearTotals(index: ArmoryIndex, gear: Gear): { stats: Record<string, number>; sets: ActiveSet[] } {
  const stats: Record<string, number> = {};
  const add = (values: Record<string, number>) => {
    for (const [key, value] of Object.entries(values)) stats[key] = (stats[key] ?? 0) + value;
  };
  const worn = new Set<string>();
  for (const slot of GEAR_SLOTS) {
    const piece = gear[slot];
    const item = piece && index.items.get(piece.item);
    if (!item) continue;
    add(piece.crit ? item.crit : item.stats);
    worn.add(item.id);
  }
  const sets: ActiveSet[] = [];
  for (const set of index.data.sets) {
    const count = set.pieces.filter((id) => worn.has(id)).length;
    if (!count) continue;
    const bonuses = set.bonuses.filter((b) => b.count <= count);
    bonuses.forEach((b) => add(b.stats));
    sets.push({ set, count, bonuses });
  }
  return { stats, sets };
}

/** a stat of one troop type: its own and the troop_* one for every type, to one decimal */
export function troopStat(stats: Record<string, number>, troop: Troop, stat: TroopStat): number {
  return Math.round(((stats[`${troop}_${stat}`] ?? 0) + (stats[`troop_${stat}`] ?? 0)) * 10) / 10;
}

/** whose stats the card shows: the march type's troops, siege for siege; a rally, garrison or mix the strongest */
export function troopOf(kind: MarchKind | '', stats: Record<string, number>): Troop {
  if (kind === 'infantry' || kind === 'cavalry' || kind === 'archer') return kind;
  if (kind === 'engineering') return 'siege';
  const sum = (troop: Troop) => troopStat(stats, troop, 'attack') + troopStat(stats, troop, 'defense') + troopStat(stats, troop, 'health');
  return (['infantry', 'cavalry', 'archer'] as const).reduce((best, troop) => (sum(troop) > sum(best) ? troop : best));
}

/** I–V */
export function roman(level: number): string {
  return ['', 'I', 'II', 'III', 'IV', 'V'][level] ?? '';
}

/** The catalog, loaded once on the first card or editor that needs it (browser only). */
@Injectable({ providedIn: 'root' })
export class ArmoryApi {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly wanted = signal(false);
  private readonly data = httpResource<ArmoryData>(() => (this.isBrowser && this.wanted() ? '/api/armory/' : undefined));
  readonly index = computed(() => (this.data.hasValue() ? armoryIndex(this.data.value()) : null));
  readonly failed = computed(() => !!this.data.error());

  load(): void {
    this.wanted.set(true);
    if (this.data.error()) this.data.reload();
  }
}

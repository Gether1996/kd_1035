import { ArmoryIndex, GEAR_SLOTS, Gear, GearPiece, GearSlot, Troop, troopStat } from '../../core/armory';
import { KvkRole, March } from '../../core/kvk-api';
import { EquipmentEval, MarchEval, armamentPoints, equipmentPoints } from './scoring';
import { EvalSettings } from './settings';

/** the troop types "Top 5 equip" ranks (Gether 19. 10. 2026: "budeme riešiť len inf, arch a cav") */
export const EQUIPMENT_KINDS = ['infantry', 'cavalry', 'archer'] as const;
export type EquipmentKind = (typeof EQUIPMENT_KINDS)[number];

/** a KvK sign-up (rally, garrison) – filled in exactly like a march */
export type EquipmentSignup = Omit<March, 'position'> & { role: KvkRole };

/** a march or a sign-up the best pieces are taken from; role = a sign-up */
export type Army = March & { role?: KvkRole };

/** a player as /api/evaluation/equipment/ sends them: R4 sees the approved players' open-field marches and sign-ups */
export interface EquipmentPlayer {
  id: number;
  name: string;
  avatar_url: string;
  marches: March[];
  /** missing in an older response */
  signups?: EquipmentSignup[];
}

export interface EquipmentData {
  /** only what scores the equipment and the armaments (equipment, armaments, marches.equipment/armaments) */
  settings: Record<string, unknown>;
  players: EquipmentPlayer[];
}

/** the best a player has for one troop type */
export interface Kit {
  player: EquipmentPlayer;
  /** the marches of that type, and the KvK sign-ups with these troops */
  marches: number;
  signups: KvkRole[];
  /** the best piece of each slot of all those marches and sign-ups, and the one each is worn in */
  gear: Gear;
  sources: Partial<Record<GearSlot, Army>>;
  equipment: EquipmentEval;
  /** the strongest formation with its armaments, and the march or sign-up it is in (null = no armaments filled in) */
  armaments: MarchEval['armaments'];
  formation: string;
  armamentsFrom: Army | null;
  total: number;
}

/**
 * What one piece adds to the equipment points of a march of this troop type: its rarity, crit and iconic level over
 * the slot weights, and its ATK + DEF + HP % of the troops – the same parts as equipmentPoints, piece by piece.
 */
export function pieceValue(settings: EvalSettings, index: ArmoryIndex, troop: Troop, slot: GearSlot, piece: GearPiece): number {
  const item = index.items.get(piece.item);
  if (!item) return -Infinity;
  const e = settings.equipment;
  const weights = GEAR_SLOTS.reduce((sum, s) => sum + e.slots[s], 0);
  const level = item.iconic ? Math.min(5, Math.max(0, piece.iconic)) : 0;
  const tier = e.base[item.rarity] + (piece.crit ? e.crit[item.rarity] : 0) + (level ? e.iconic[level - 1] : 0);
  const values = piece.crit ? item.crit : item.stats;
  const stats = troopStat(values, troop, 'attack') + troopStat(values, troop, 'defense') + troopStat(values, troop, 'health');
  return (weights > 0 ? ((1 - e.statsWeight) * e.slots[slot] * tier) / weights : 0) + (e.statsWeight * 100 * stats) / e.statsMax;
}

/** a march made of the gear alone – equipmentPoints reads only its type and gear */
const asMarch = (kind: EquipmentKind, gear: Gear): March => ({ id: 0, position: 0, kind, primary: '', secondary: '', gear });

/**
 * The best piece of each slot of all marches (Gether 19. 10. 2026: "hráč má 3 cav páry, zobrať to najlepšie čo má z
 * každého páru ohľadom equipu"); the two accessories are two different items, like on a march.
 */
export function bestGear(
  settings: EvalSettings,
  index: ArmoryIndex,
  kind: EquipmentKind,
  marches: Army[],
): { gear: Gear; sources: Partial<Record<GearSlot, Army>> } {
  const gear: Gear = {};
  const sources: Partial<Record<GearSlot, Army>> = {};
  const value = (slot: GearSlot, piece: GearPiece) => pieceValue(settings, index, kind, slot, piece);
  for (const slot of GEAR_SLOTS) {
    if (slot.startsWith('accessory')) continue;
    for (const march of marches) {
      const piece = march.gear?.[slot];
      if (!piece || !index.items.has(piece.item)) continue;
      const best = gear[slot];
      if (!best || value(slot, piece) > value(slot, best)) {
        gear[slot] = piece;
        sources[slot] = march;
      }
    }
  }
  const accessories = marches
    .flatMap((march) => (['accessory1', 'accessory2'] as const).map((slot) => ({ march, piece: march.gear?.[slot] })))
    .filter((a): a is { march: Army; piece: GearPiece } => !!a.piece && index.items.has(a.piece.item))
    .sort((a, b) => value('accessory1', b.piece) - value('accessory1', a.piece));
  const first = accessories[0];
  const second = first && accessories.find((a) => a.piece.item !== first.piece.item);
  if (first) [gear.accessory1, sources.accessory1] = [first.piece, first.march];
  if (second) [gear.accessory2, sources.accessory2] = [second.piece, second.march];
  return { gear, sources };
}

/**
 * The best a player has for one troop type: the best pieces of all its marches and KvK sign-ups (rally, garrison) put
 * together – or one march's own gear when it scores more (a full set its bonus counts for would be split by taking
 * the pieces one by one) – and the strongest formation with its armaments ("tú najsilnejšiu formáciu, ktorú má na cav
 * pároch"). Total = equipment × its weight + armaments × theirs, as a march counts in the estimate (no pair or skills –
 * those are the commanders'): who has the best gear to lead a rally or a garrison with these troops.
 */
export function kitOf(settings: EvalSettings, index: ArmoryIndex, kind: EquipmentKind, player: EquipmentPlayer): Kit | null {
  const signups = (player.signups ?? []).filter((s) => s.kind === kind);
  const marches: Army[] = [
    ...player.marches.filter((m) => m.kind === kind),
    ...signups.map((s) => ({ ...s, position: 0 })),
  ];
  if (!marches.length) return null;
  const combined = bestGear(settings, index, kind, marches);
  let best = { ...combined, equipment: equipmentPoints(settings, asMarch(kind, combined.gear), index) };
  for (const march of marches) {
    const gear = march.gear ?? {};
    const equipment = equipmentPoints(settings, asMarch(kind, gear), index);
    if (equipment.points > best.equipment.points + 1e-9) {
      best = { gear, sources: Object.fromEntries(Object.keys(gear).map((slot) => [slot, march])), equipment };
    }
  }
  let armaments = armamentPoints(settings, marches[0], index);
  let armamentsFrom: Army | null = marches[0];
  for (const march of marches.slice(1)) {
    const a = armamentPoints(settings, march, index);
    if (a.points > armaments.points + 1e-9 || (a.points === armaments.points && !armamentsFrom?.formation && march.formation)) {
      armaments = a;
      armamentsFrom = march;
    }
  }
  if (!armaments.filled && !armamentsFrom?.formation) armamentsFrom = null;
  const m = settings.marches;
  return {
    player,
    marches: marches.length - signups.length,
    signups: signups.map((s) => s.role),
    gear: best.gear,
    sources: best.sources,
    equipment: best.equipment,
    armaments,
    formation: armamentsFrom?.formation ?? '',
    armamentsFrom,
    total: best.equipment.points * m.equipment + armaments.points * m.armaments,
  };
}

/** every player with a march of the type, the best first (then the equipment, then the name) */
export function equipmentRanking(settings: EvalSettings, index: ArmoryIndex, kind: EquipmentKind, players: EquipmentPlayer[]): Kit[] {
  return players
    .map((player) => kitOf(settings, index, kind, player))
    .filter((kit): kit is Kit => !!kit)
    .sort(
      (a, b) =>
        b.total - a.total || b.equipment.points - a.equipment.points || a.player.name.localeCompare(b.player.name),
    );
}

import { IconName } from '../../shared/icon';

export type HallCategory = 'forts' | 'kp' | 'rally' | 'garrison' | 'helper' | 'diplomat' | 'equipment' | 'mascot' | 'zero';

/**
 * "Najlepšia výbava" (3. 11. 2026): the place is the troop type, not a rank – place 1 infantry, 2 cavalry, 3 archers,
 * the order of EQUIPMENT_KINDS of Top 5 equip (kept here, so the home teaser does not load the scoring)
 */
export const EQUIPMENT_TROOPS = ['infantry', 'cavalry', 'archer'] as const;
export type EquipmentTroop = (typeof EQUIPMENT_TROOPS)[number];

/** the troop type of a place of the best equipment */
export const troopOfPlace = (place: number): EquipmentTroop | null => EQUIPMENT_TROOPS[place - 1] ?? null;

/** a filled place, as /api/hall/ sends it */
export interface HallEntry {
  id: number;
  category: HallCategory;
  place: number;
  name: string;
  /** the player's Discord avatar ('' for a name alone) */
  avatar_url: string;
  /** the uploaded photo ('' without one) */
  photo: string;
  note: { sk: string; cs: string };
  /** forts of the last week, kill points of the last KvK – as the superadmin wrote it ("250", "1.37B"), '' = none */
  count: string;
  // the superadmin's only – what the editor fills in again
  player?: number | null;
  custom_name?: string;
  note_sk?: string;
  note_cs?: string;
}

export interface HallData {
  entries: HallEntry[];
  /** the superadmin's only: how many places each category has */
  places?: Record<HallCategory, number>;
}

/**
 * the categories with a top 3 – the wide columns on the raised step (Gether 28. 10. 2026: "nech je to motivačné");
 * the best equipment has its three troop types there the same way
 */
export const TRIOS: HallCategory[] = ['forts', 'kp', 'equipment'];

/** the pedestals in the order of the hall (the mascots have their own corner) */
export const HONOURS: HallCategory[] = ['forts', 'kp', 'equipment', 'rally', 'garrison', 'helper', 'diplomat'];

export const HALL_ICONS: Record<HallCategory, IconName> = {
  forts: 'castle',
  kp: 'swords',
  rally: 'flag',
  garrison: 'shield',
  helper: 'hand-helping',
  diplomat: 'handshake',
  equipment: 'gem',
  mascot: 'laugh',
  zero: 'skull',
};

/** the picture of a place: the uploaded photo, else the Discord avatar a size larger, else none (the initial shows) */
export function portrait(entry: HallEntry): string {
  return entry.photo || entry.avatar_url.replace('size=64', 'size=256');
}

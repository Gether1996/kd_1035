import { Dict } from '../core/i18n/sk';
import { ARMAMENT_STATS, MarchKind } from '../core/kvk-api';

/** "Cav ATK" for a cavalry march (Gether 11. 10. 2026); plain "ATK" when the type names no troop (rally, garrison, mix) */
export function statLabel(t: Dict['marches'], kind: MarchKind | '', stat: (typeof ARMAMENT_STATS)[number]): string {
  const troops: Partial<Record<MarchKind, string>> = t.troops;
  const troop = kind ? troops[kind] : undefined;
  return stat === 'damage' || !troop ? t.stats[stat] : `${troop} ${t.stats[stat]}`;
}

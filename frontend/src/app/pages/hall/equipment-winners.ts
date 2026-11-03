import { ArmoryIndex } from '../../core/armory';
import { EQUIPMENT_KINDS, EquipmentData, EquipmentPlayer, equipmentRanking } from '../evaluation/equipment';
import { normalizeSettings } from '../evaluation/settings';

/**
 * "Načítať z Top 5 equip" of the hall's editor (3. 11. 2026): the player Top 5 equip of /vyhodnocovanie shows first
 * for infantry, cavalry and archers – the same scoring, the same data (/api/evaluation/equipment/) – in the order of
 * the places of the best equipment; null = nobody has scored with that troop type, the place stays empty.
 */
export function equipmentWinners(data: EquipmentData, index: ArmoryIndex): (EquipmentPlayer | null)[] {
  const settings = normalizeSettings(data.settings);
  return EQUIPMENT_KINDS.map((kind) => {
    const first = equipmentRanking(settings, index, kind, data.players)[0];
    return first && first.total > 0 ? first.player : null;
  });
}

import { Dict } from '../core/i18n/sk';
import { ARMAMENT_CAPS, ARMAMENT_STATS, ArmamentStat, MarchKind, overCaps } from '../core/kvk-api';

/** "Cav ATK" for a cavalry march (Gether 11. 10. 2026); plain "ATK" when the type names no troop (rally, garrison, mix) */
export function statLabel(t: Dict['marches'], kind: MarchKind | '', stat: (typeof ARMAMENT_STATS)[number]): string {
  const troops: Partial<Record<MarchKind, string>> = t.troops;
  const troop = kind ? troops[kind] : undefined;
  return stat === 'damage' || !troop ? t.stats[stat] : `${troop} ${t.stats[stat]}`;
}

/** the highest armament bonus: two digits and one decimal */
export const BONUS_MAX = 99.9;

/**
 * An armament bonus as it is typed (Gether 12. 10. 2026: one decimal allowed): digits, a comma or a dot and one more
 * digit; anything else is dropped from the field at once. null = empty.
 */
export function readBonus(input: HTMLInputElement): number | null {
  const [typed, ...rest] = input.value.replace(/[^\d.,]/g, '').split(/[.,]/);
  const whole = typed.slice(0, 2);
  const fraction = rest.join('').slice(0, 1);
  const clean = whole + (rest.length ? ',' + fraction : '');
  if (input.value !== clean) input.value = clean;
  if (!whole && !fraction) return null;
  return Math.min(Number(`${whole || 0}.${fraction || 0}`), BONUS_MAX);
}

/** 12.5 → "12,5", 12 → "12" (one decimal at most, a decimal comma like in Slovak and Czech) */
export function formatBonus(value: number | null | undefined): string {
  if (value == null) return '';
  return (Math.round(value * 10) / 10).toString().replace('.', ',');
}

/** "All DMG 24 % (max 8 %), HP 15 % (max 14 %)" – the armament bonuses over their cap; '' = none */
export function overCapText(
  t: Dict['marches'],
  army: Partial<Record<ArmamentStat, number | null>>,
  stats: readonly ArmamentStat[] = overCaps(army),
): string {
  return stats
    .map((stat) =>
      t.statsOver
        .replace('{stat}', t.stats[stat])
        .replace('{value}', formatBonus(army[stat]))
        .replace('{max}', formatBonus(ARMAMENT_CAPS[stat])),
    )
    .join(', ');
}

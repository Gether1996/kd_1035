import { ArmoryIndex } from '../../core/armory';
import { KvkSignup, MarchKind, asMarch } from '../../core/kvk-api';
import { armamentPoints, equipmentPoints } from '../evaluation/scoring';
import { EvalSettings } from '../evaluation/settings';

/** how many of each troop type the "Top 5" above the sign-ups shows (Gether 23. 10. 2026: three; 29. 10. 2026: "tiež top 5") */
export const TOP_SIZE = 5;

export interface TopSignup {
  signup: KvkSignup;
  /** equipment × its weight + armaments × theirs – as "Top 5 equip" counts a march (no pair, no skills) */
  total: number;
}

/**
 * The best sign-ups of one troop type by their own equipment and armaments, scored like "Top 5 equip" of the KvK
 * evaluation (Gether 23. 10. 2026: "top 3 za každý troop type", five since 29. 10. 2026): each player once, with their best sign-up of the
 * type (two rally sign-ups are one player); nothing scored (no equipment, no armaments) is left out.
 */
export function topSignups(
  signups: readonly KvkSignup[],
  settings: EvalSettings,
  index: ArmoryIndex,
  kind: MarchKind,
  size = TOP_SIZE,
): TopSignup[] {
  const m = settings.marches;
  const best = new Map<number, TopSignup>();
  for (const signup of signups) {
    if (signup.kind !== kind) continue;
    const march = asMarch(signup);
    const total =
      equipmentPoints(settings, march, index).points * m.equipment + armamentPoints(settings, march, index).points * m.armaments;
    if (!(total > 0)) continue;
    const key = signup.player?.id ?? -signup.id;
    const known = best.get(key);
    if (!known || total > known.total) best.set(key, { signup, total });
  }
  const name = (s: KvkSignup) => s.player?.ingame_name || s.player?.name || '';
  return [...best.values()]
    .sort((a, b) => b.total - a.total || name(a.signup).localeCompare(name(b.signup)))
    .slice(0, size);
}

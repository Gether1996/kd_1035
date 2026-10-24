import { buildOf } from '../../core/armory';
import { ARMAMENT_STATS, KVK_KINDS, March, MarchKind, REQUIRED_STATS } from '../../core/kvk-api';
import { MarchChange } from '../../core/marches-api';
import { ArmyDraft, armyDraft } from '../../shared/march-fields';

/**
 * "Vyplniť z marchu" (24. 10. 2026): a sign-up filled in from one of the player's marches – copied once, a later change
 * of the march does not change the sign-up. The form gets the type, the commanders and their skills right away; the
 * build and the armaments go with saveBuild after the form is saved, so the server checks everything as usual.
 */

/** the form of the march; a type a sign-up does not offer (leadership, siege…) stays empty for the player to pick */
export function draftOf(march: March): ArmyDraft {
  const draft = armyDraft(march);
  return KVK_KINDS.includes(draft.kind as MarchKind) ? draft : { ...draft, kind: '' };
}

/**
 * The build and the armament bonuses of the march for saveBuild; null = nothing to copy. A build needs ATK, DEF and HP
 * on the server – an older march without them copies nothing and the build editor opens as for a new sign-up.
 */
export function buildChange(march: March): MarchChange | null {
  if (!REQUIRED_STATS.every((stat) => march[stat] != null)) return null;
  const stats = Object.fromEntries(ARMAMENT_STATS.map((stat) => [stat, march[stat] ?? 0]));
  return { ...buildOf(march), ...stats };
}

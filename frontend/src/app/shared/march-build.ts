import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import {
  ArmoryApi,
  INSCRIPTION_RARITIES,
  Inscription,
  TROOP_STATS,
  buildOf,
  gearTotals,
  troopOf,
  troopStat,
} from '../core/armory';
import { I18n } from '../core/i18n/i18n';
import { ARMAMENT_STATS, March, marchIcon } from '../core/kvk-api';
import { FormationIcon } from './formation-icon';
import { GearGrid } from './gear-grid';
import { statLabel } from './stat-label';

/**
 * One march with its build on /marche (Gether 12. 10. 2026: "prehľad mojich marchov", our own layout, not a copy of
 * meta-rok): the commanders on top; the equipment as tiles with the bonuses it gives to the march's troops (set bonuses
 * included); the formation as its icon with the inscriptions, gold first, and the armament bonuses typed in – as little
 * text as possible (Gether 12. 10. 2026). The catalog (core/armory.ts) loads with
 * the first card. Buttons of the own marches are projected into the head.
 */
@Component({
  selector: 'app-march-build',
  imports: [FormationIcon, GearGrid],
  templateUrl: './march-build.html',
  styleUrl: './march-build.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarchBuild {
  readonly march = input.required<March>();
  /** commander name → portrait */
  readonly portraits = input<ReadonlyMap<string, string>>(new Map());
  /** the player's own march: an empty build invites to fill it */
  readonly own = input(false);
  readonly numbered = input(true);

  private readonly armory = inject(ArmoryApi);
  protected readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.t().marches);
  protected readonly index = this.armory.index;
  protected readonly failed = this.armory.failed;
  protected readonly icon = marchIcon;

  protected readonly build = computed(() => buildOf(this.march()));
  protected readonly empty = computed(() => {
    const b = this.build();
    return !Object.keys(b.gear).length && !b.formation && !b.inscriptions.length;
  });

  protected readonly commanders = computed(() =>
    [this.march().primary, this.march().secondary].filter(Boolean).map((name) => ({ name, src: this.portraits().get(name) })),
  );

  private readonly totals = computed(() => {
    const index = this.index();
    return index ? gearTotals(index, this.build().gear) : null;
  });

  /** "ATK 61.5%" … of the march's troops, with whose they are */
  protected readonly gearStats = computed(() => {
    const totals = this.totals();
    if (!totals || !Object.keys(this.build().gear).length) return null;
    const troop = troopOf(this.march().kind, totals.stats);
    const b = this.t().build;
    return {
      title: b.gearStats.replace('{troop}', b.troops[troop]),
      values: TROOP_STATS.map((stat) => ({ stat, label: b.stats[stat], value: troopStat(totals.stats, troop, stat) })).filter(
        (s) => s.value > 0 || s.stat !== 'march_speed',
      ),
    };
  });

  protected readonly formation = computed(() => this.index()?.formations.get(this.build().formation) ?? null);

  /** the inscriptions, gold first, then blue and white */
  protected readonly inscriptions = computed(() => {
    const index = this.index();
    if (!index) return [];
    return this.build()
      .inscriptions.map((id) => index.inscriptions.get(id))
      .filter((i): i is Inscription => !!i)
      .sort((a, b) => INSCRIPTION_RARITIES.indexOf(a.rarity) - INSCRIPTION_RARITIES.indexOf(b.rarity));
  });

  /** the armament bonuses typed in (the march's ATK, DEF, HP, All DMG) */
  protected readonly armamentStats = computed(() => {
    const march = this.march();
    return ARMAMENT_STATS.filter((key) => march[key] != null).map((key) => ({
      key,
      label: this.t().stats[key],
      full: statLabel(this.t(), march.kind, key),
      value: march[key]!,
    }));
  });

  constructor() {
    this.armory.load();
  }

  protected initials(name: string): string {
    return name
      .split(/\s+/)
      .filter((word) => /^[A-ZÀ-Ž]/.test(word))
      .slice(0, 2)
      .map((word) => word[0])
      .join('');
  }
}

import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import {
  ArmoryApi,
  GearSlot,
  INSCRIPTION_RARITIES,
  marchTroop,
  Inscription,
  TROOP_STATS,
  buildOf,
  emptyParts,
  gearTotals,
  troopOf,
  troopStat,
} from '../core/armory';
import { I18n } from '../core/i18n/i18n';
import { ARMAMENT_STATS, INSCRIPTIONS, March, REQUIRED_STATS, marchHasProblem, marchIcon } from '../core/kvk-api';
import { FormationIcon } from './formation-icon';
import { GearGrid } from './gear-grid';
import { Icon } from './icon';
import { SetBonuses } from './set-bonuses';
import { formatBonus, overCapText, statLabel } from './stat-label';

let nextId = 0;

/**
 * One march with its build on /marche (Gether 12. 10. 2026: our own layout, not a copy of meta-rok, as little text as
 * possible): the commanders on top with the march type as a badge; a small heading over each column – the equipment
 * as tiles with the bonuses it gives to the march's troops (set bonuses included), the armaments as the formation icon,
 * the inscriptions (gold first) and the bonuses typed in. A tile of the own march opens the editor on its slot. The
 * catalog (core/armory.ts) loads with the first card. Buttons of the own marches are projected into the head.
 */
@Component({
  selector: 'app-march-build',
  imports: [FormationIcon, GearGrid, Icon, SetBonuses],
  templateUrl: './march-build.html',
  styleUrl: './march-build.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.is-detail]': 'detail()', '[class.is-bad-pair]': 'hasProblem()' },
})
export class MarchBuild {
  readonly march = input.required<March>();
  /** commander name → portrait */
  readonly portraits = input<ReadonlyMap<string, string>>(new Map());
  /** the player's own march: its tiles are buttons, an empty equipment shows its empty slots */
  readonly own = input(false);
  readonly numbered = input(true);
  /** a march saved before ATK, DEF and HP were required says they are missing */
  readonly statsRequired = input(false);
  /** a tile of the own march clicked: the editor opens on that slot */
  readonly slotPick = output<GearSlot>();
  /** "Doplň bonusy armamentov" of the own march: the editor opens on its Armamenty tab */
  readonly armamentsPick = output<void>();
  protected readonly id = `march-build-${++nextId}`;
  /**
   * Compact by default (Gether 13. 10. 2026: "šetriť miesto, pokiaľ niekoho nezaujímajú detaily %"): a smaller
   * equipment, no bonuses in % and no set bonuses – "Detail" shows them with the full-size equipment.
   */
  protected readonly detail = signal(false);

  private readonly armory = inject(ArmoryApi);
  protected readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.t().marches);
  protected readonly index = this.armory.index;
  protected readonly failed = this.armory.failed;
  protected readonly icon = marchIcon;
  protected readonly bonus = formatBonus;
  /** the red border: a pair, a formation or an armament bonus the KvK evaluation does not like */
  protected readonly hasProblem = computed(() => marchHasProblem(this.march()));

  protected readonly build = computed(() => buildOf(this.march()));
  protected readonly empty = computed(() => {
    const b = this.build();
    return !Object.keys(b.gear).length && !b.formation && !b.inscriptions.length;
  });

  /** the commanders with their portraits and skill levels (5555 = expertise) */
  protected readonly commanders = computed(() => {
    const m = this.march();
    return [
      { name: m.primary, skills: m.primary_skills ?? '' },
      { name: m.secondary, skills: m.secondary_skills ?? '' },
    ]
      .filter((c) => c.name)
      .map((c) => ({ ...c, src: this.portraits().get(c.name) }));
  });

  private readonly totals = computed(() => {
    const index = this.index();
    return index ? gearTotals(index, this.build().gear) : null;
  });

  /** "ATK 61.5%" … of the march's troops (whose in the title); a 0 is left out */
  protected readonly gearStats = computed(() => {
    const totals = this.totals();
    if (!totals) return null;
    const troop = troopOf(this.march().kind, totals.stats);
    const b = this.t().build;
    const values = TROOP_STATS.map((stat) => ({ stat, label: b.stats[stat], value: troopStat(totals.stats, troop, stat) }));
    const shown = values.filter((s) => s.value > 0);
    return shown.length ? { title: b.gearStats.replace('{troop}', b.troops[troop]), values: shown } : null;
  });

  /** the crit badge of every item: the march's troops */
  protected readonly critTroop = computed(() => marchTroop(this.march().kind, this.totals()?.stats ?? {}));

  /** the sets worn – their bonuses reached are written under the equipment */
  protected readonly worn = computed(() => this.totals()?.sets ?? []);

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

  /**
   * A formation the march's primary commander should not lead with (the KvK evaluation, Gether 14. 10. 2026) – the
   * server tells the player and the superuser only
   */
  protected readonly formationProblem = computed(() => {
    const march = this.march();
    const wanted = march.formation_problem;
    if (!wanted?.length) return null;
    const name = (id: string | undefined) => (id && this.index()?.formations.get(id)?.name) || id || '';
    return this.t()
      .formationProblem.replace('{have}', name(march.formation))
      .replace('{commander}', march.primary)
      .replace('{want}', wanted.map(name).join(' / '));
  });

  /**
   * The armament bonuses over their cap (Gether 19. 10. 2026) – the server tells the player and the superuser (a
   * sign-up: also R4); their values are red in the detail as well
   */
  protected readonly overCap = computed<ReadonlySet<string>>(() => new Set(this.march().stats_problem ?? []));
  protected readonly statsProblem = computed(() => {
    const march = this.march();
    if (!march.stats_problem?.length) return null;
    return this.t().statsProblem.replace('{stats}', overCapText(this.t(), march, march.stats_problem));
  });

  /** how to fix a pair the evaluation does not score: the other order is scored – the names as on the march */
  protected readonly pairHint = computed(() => {
    const march = this.march();
    if (!march.pair_hint?.swap) return null;
    return this.t().pairHint.swap.replace('{secondary}', march.secondary).replace('{primary}', march.primary);
  });

  /** the own march with no item or no armament at all: a red link opens the editor on that tab */
  protected readonly missing = computed(() => {
    const parts = emptyParts(this.march());
    return { gear: this.own() && parts.gear, armaments: this.own() && parts.armaments };
  });

  protected readonly statsMissing = computed(
    () => this.statsRequired() && REQUIRED_STATS.some((stat) => this.march()[stat] == null),
  );

  /** a march saved before its inscriptions were clicked together keeps the counts typed in (gold, blue, white) */
  protected readonly counts = computed(() => {
    const march = this.march();
    if (this.inscriptions().length) return [];
    return INSCRIPTIONS.filter((key) => (march[key] ?? 0) > 0).map((key) => ({ key, value: march[key]! }));
  });

  /** something the compact card hides: a bonus of the equipment or the armaments, a set bonus */
  protected readonly hasDetail = computed(
    () => !!this.gearStats() || this.worn().length > 0 || (!this.statsMissing() && this.armamentStats().length > 0),
  );

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

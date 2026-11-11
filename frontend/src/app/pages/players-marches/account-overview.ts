import { httpResource } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  ArmoryApi,
  ArmoryIndex,
  Formation,
  Gear,
  INSCRIPTION_RARITIES,
  Inscription,
  ItemTroop,
  buildOf,
  gearTotals,
  marchTroop,
} from '../../core/armory';
import { Auth } from '../../core/auth';
import { I18n } from '../../core/i18n/i18n';
import { ARMAMENT_STATS, March, marchIcon } from '../../core/kvk-api';
import { MarchCommander, MarchesApi, marchCommandersUrl } from '../../core/marches-api';
import { FormationIcon } from '../../shared/formation-icon';
import { shortGameNumber } from '../../shared/game-number';
import { GearGrid } from '../../shared/gear-grid';
import { Icon } from '../../shared/icon';
import { formatBonus, statLabel } from '../../shared/stat-label';

/** one march as a column of the overview */
interface Column {
  march: March;
  commanders: { name: string; skills: string; src: string | undefined }[];
  gear: Gear;
  formation: Formation | null;
  /** the crit badge of every item: the march's troops */
  crit: ItemTroop;
  inscriptions: Inscription[];
  stats: { key: string; label: string; value: string }[];
}

/**
 * "Prehľad účtu" on /marche (?tab=ucet, Gether 10. 11. 2026 – Smrťák's idea: "aby ti tie stránky urobili taký report"):
 * the player's account at a glance – the name, VIP, power, kill points and the highest acclaim written down on /ucet,
 * then every march as a column side by side: the commanders, the equipment like the game's screen, the inscriptions
 * (gold first), the formation and the armament bonuses (All DMG only when not 0). As many columns as fit – up to seven
 * on an ultrawide screen, one or two on a phone; the parts line up across the columns of a row (CSS subgrid). The
 * player's own data only, read in the browser.
 */
@Component({
  selector: 'app-account-overview',
  imports: [RouterLink, FormationIcon, GearGrid, Icon],
  templateUrl: './account-overview.html',
  styleUrl: './account-overview.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountOverview {
  protected readonly auth = inject(Auth);
  protected readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.t().playersMarches.account);
  protected readonly m = computed(() => this.i18n.t().marches);
  private readonly armory = inject(ArmoryApi);
  protected readonly index = this.armory.index;
  protected readonly icon = marchIcon;
  protected readonly short = shortGameNumber;

  private readonly data = inject(MarchesApi).list();
  protected readonly loaded = computed(() => this.data.hasValue() || !!this.data.error());
  protected readonly failed = computed(() => !!this.data.error());
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly commanderData = httpResource<MarchCommander[]>(() => (this.isBrowser ? marchCommandersUrl : undefined));
  private readonly portraits = computed(
    () => new Map((this.commanderData.hasValue() ? this.commanderData.value() : []).map((c) => [c.name, c.icon])),
  );

  /** "VIP 18" … the numbers the player wrote down; '' each when not */
  protected readonly user = computed(() => this.auth.user());
  protected readonly updated = computed(() => {
    const at = this.user()?.stats_updated_at;
    if (!at) return '';
    const day = new Intl.DateTimeFormat(this.i18n.locale(), { day: 'numeric', month: 'numeric', year: 'numeric' });
    return this.t().updated.replace('{date}', day.format(new Date(at)));
  });

  protected readonly columns = computed<Column[]>(() => {
    if (!this.data.hasValue()) return [];
    const index = this.index();
    const portraits = this.portraits();
    return [...this.data.value().marches]
      .sort((a, b) => a.position - b.position)
      .map((march) => {
        const build = buildOf(march);
        return {
        march,
        gear: build.gear,
        formation: index?.formations.get(build.formation) ?? null,
        crit: marchTroop(march.kind, index ? gearTotals(index, build.gear).stats : {}),
        commanders: [
          { name: march.primary, skills: march.primary_skills ?? '' },
          { name: march.secondary, skills: march.secondary_skills ?? '' },
        ]
          .filter((c) => c.name)
          .map((c) => ({ ...c, src: portraits.get(c.name) })),
        inscriptions: index ? this.inscriptionsOf(march, index) : [],
        // All DMG at 0 % is no bonus at all (Gether 11. 11. 2026: "all dmg pokiaľ je 0 % tak neukazuj")
        stats: ARMAMENT_STATS.filter((key) => march[key] != null && !(key === 'damage' && !march[key])).map((key) => ({
          key,
          label: statLabel(this.m(), march.kind, key),
          value: formatBonus(march[key]!),
        })),
        };
      });
  });

  constructor() {
    this.armory.load();
  }

  /** gold first, then blue and white, like the game's overview of a march */
  private inscriptionsOf(march: March, index: ArmoryIndex): Inscription[] {
    const order = (i: Inscription) => INSCRIPTION_RARITIES.indexOf(i.rarity);
    return buildOf(march)
      .inscriptions.map((id) => index.inscriptions.get(id))
      .filter((i): i is Inscription => !!i)
      .sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));
  }

  protected initials(name: string): string {
    return name
      .split(/\s+/)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }
}

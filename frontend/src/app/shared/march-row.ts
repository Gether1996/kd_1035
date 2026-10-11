import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { ARMAMENT_STATS, INSCRIPTIONS, March, MarchImage, MarchKind, marchIcon } from '../core/kvk-api';
import { Dict } from '../core/i18n/sk';
import { I18n } from '../core/i18n/i18n';
import { Icon } from './icon';


/** "Cav ATK" for a cavalry march (Gether 11. 10. 2026); plain "ATK" when the type names no troop (rally, garrison, mix) */
export function statLabel(t: Dict['marches'], kind: MarchKind | '', stat: (typeof ARMAMENT_STATS)[number]): string {
  const troops: Partial<Record<MarchKind, string>> = t.troops;
  const troop = kind ? troops[kind] : undefined;
  return stat === 'damage' || !troop ? t.stats[stat] : `${troop} ${t.stats[stat]}`;
}

/**
 * One march in a compact row (Gether 11. 10. 2026: "stačia len hlavy commanderov bez popisov"): number, type icon,
 * the commanders' portraits (names in alt and title), the two screenshots and below them the armament bonuses and
 * inscriptions. Used on /marche (players and own marches) and next to the KvK sign-ups; buttons of the own marches
 * are projected into the second line.
 */
@Component({
  selector: 'app-march-row',
  imports: [Icon],
  host: { '[class.is-numbered]': 'numbered()' },
  templateUrl: './march-row.html',
  styleUrl: './march-row.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarchRow {
  readonly march = input.required<March>();
  /** commander name → portrait */
  readonly portraits = input<ReadonlyMap<string, string>>(new Map());
  /** whose march it is, for the screen reader labels of the screenshots ("Gether, 2. march") */
  readonly owner = input('');
  /** the screenshots open in a new tab; otherwise `shot` asks the page to show them */
  readonly links = input(false);
  /** a missing screenshot is marked (the player's own marches) */
  readonly showMissing = input(false);
  /** the screenshots it has: a march only the equipment, a KvK sign-up the armaments too */
  readonly shotKinds = input<MarchImage['kind'][]>(['equipment']);
  /** the march number in front; a KvK sign-up has none */
  readonly numbered = input(true);
  readonly shot = output<{ image: MarchImage; event: Event }>();

  protected readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.t().marches);
  protected readonly icon = marchIcon;

  protected readonly names = computed(() => [this.march().primary, this.march().secondary].filter(Boolean));

  /** "ATK 12%" – the type icon in front says whose bonuses they are; the full "Cav ATK" for screen readers and title */
  protected readonly stats = computed(() => {
    const march = this.march();
    return ARMAMENT_STATS.filter((key) => march[key] != null).map((key) => ({
      key,
      label: this.t().stats[key],
      full: statLabel(this.t(), march.kind, key),
      value: march[key]!,
    }));
  });

  protected readonly inscriptions = computed(() => {
    const march = this.march();
    return INSCRIPTIONS.filter((key) => march[key] != null).map((key) => ({ key, value: march[key]! }));
  });

  protected imageOf(kind: MarchImage['kind']): MarchImage | undefined {
    return this.march().images.find((image) => image.kind === kind);
  }

  protected shotLabel(kind: MarchImage['kind']): string {
    const where = this.numbered() ? this.t().march.replace('{n}', String(this.march().position)) : '';
    return [this.t().images[kind], [this.owner(), where].filter(Boolean).join(', ')].filter(Boolean).join(' – ');
  }

  /** "Gonzalo de Cordoba" → GC, when a portrait is missing */
  protected initials(name: string): string {
    return name
      .split(/\s+/)
      .filter((word) => /^[A-ZÀ-Ž]/.test(word))
      .slice(0, 2)
      .map((word) => word[0])
      .join('');
  }
}

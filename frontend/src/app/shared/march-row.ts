import { ChangeDetectionStrategy, Component, computed, inject, input, viewChild } from '@angular/core';
import { ARMAMENT_STATS, INSCRIPTIONS, March, MarchImage, REQUIRED_STATS, marchIcon } from '../core/kvk-api';
import { I18n } from '../core/i18n/i18n';
import { Icon } from './icon';
import { GEAR_SLOTS, hasBuild } from '../core/armory';
import { BuildDialog } from './build-dialog';
import { ImageViewer } from './image-viewer';
import { formatBonus, statLabel } from './stat-label';

/**
 * One march in a compact row (Gether 11. 10. 2026: "stačia len hlavy commanderov bez popisov"): number, type icon,
 * the commanders' portraits (names in alt and title), the two screenshots and below them the armament bonuses and
 * inscriptions. Used on /marche (players and own marches) and next to the KvK sign-ups; buttons of the own marches
 * are projected into the second line. A thumbnail opens its screenshot in a dialog (ImageViewer), never a new page.
 */
@Component({
  selector: 'app-march-row',
  imports: [BuildDialog, Icon, ImageViewer],
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
  /** a missing screenshot is marked (the player's own marches) */
  readonly showMissing = input(false);
  /** the screenshots it has: only a KvK sign-up (equipment, armaments) – a march clicks its equipment together */
  readonly shotKinds = input<MarchImage['kind'][]>([]);
  /** the march number in front; a KvK sign-up has none */
  readonly numbered = input(true);
  /** a march (not a KvK sign-up): its bonuses are required – a march saved before says they are missing */
  readonly statsRequired = input(false);
  private readonly viewer = viewChild.required(ImageViewer);
  private readonly buildDialog = viewChild.required(BuildDialog);

  protected readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.t().marches);
  protected readonly icon = marchIcon;
  protected readonly bonus = formatBonus;

  /** the equipment and armaments clicked together (core/armory.ts): a tile with the first item opens them */
  protected readonly build = computed(() => {
    const march = this.march();
    if (!hasBuild(march)) return null;
    const first = GEAR_SLOTS.map((slot) => march.gear?.[slot]).find(Boolean);
    return { icon: first ? `/static/guides/gear/${first.item}.webp` : null };
  });

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

  /** saved before the bonuses were required (v1.15.1): the row says so, the owner's row asks to fill them in */
  protected readonly statsMissing = computed(
    () => this.statsRequired() && REQUIRED_STATS.some((stat) => this.march()[stat] == null),
  );

  protected readonly inscriptions = computed(() => {
    const march = this.march();
    // a 0 says nothing (a new march has no inscriptions clicked yet)
    return INSCRIPTIONS.filter((key) => (march[key] ?? 0) > 0).map((key) => ({ key, value: march[key]! }));
  });

  protected imageOf(kind: MarchImage['kind']): MarchImage | undefined {
    return this.march().images?.find((image) => image.kind === kind);
  }

  /** the screenshots of the march in the order of the thumbnails, from the clicked one on */
  protected show(image: MarchImage, event: Event): void {
    const images = this.shotKinds()
      .map((kind) => this.imageOf(kind))
      .filter((i): i is MarchImage => !!i);
    const where = this.numbered() ? this.t().march.replace('{n}', String(this.march().position)) : '';
    const title = [this.owner(), where].filter(Boolean).join(' · ');
    this.viewer().open(
      title,
      images.map((i) => ({ url: i.url, width: i.width, height: i.height, label: this.t().images[i.kind] })),
      images.indexOf(image),
      event,
    );
  }

  protected showBuild(event: Event): void {
    const where = this.numbered() ? this.t().march.replace('{n}', String(this.march().position)) : '';
    const title = [this.owner(), where].filter(Boolean).join(' · ');
    this.buildDialog().open(this.march(), this.portraits(), title, this.numbered(), event);
  }

  protected buildLabel(): string {
    const where = this.numbered() ? this.t().march.replace('{n}', String(this.march().position)) : '';
    return [this.t().build.open, [this.owner(), where].filter(Boolean).join(', ')].filter(Boolean).join(' – ');
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

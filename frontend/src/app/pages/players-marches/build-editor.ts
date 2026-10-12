import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, output, signal, viewChild } from '@angular/core';
import {
  ARMAMENT_PIECES,
  ArmoryApi,
  ArmoryItem,
  Build,
  GEAR_SLOTS,
  GearSlot,
  ICONIC_MAX,
  ITEM_RARITIES,
  Inscription,
  MAX_INSCRIPTIONS,
  TROOP_STATS,
  buildOf,
  gearTotals,
  itemSlot,
  roman,
  troopOf,
  troopStat,
} from '../../core/armory';
import { I18n } from '../../core/i18n/i18n';
import { March } from '../../core/kvk-api';
import { MarchesApi } from '../../core/marches-api';
import { FormationIcon } from '../../shared/formation-icon';
import { GearGrid } from '../../shared/gear-grid';
import { Icon } from '../../shared/icon';
import { fold } from '../../shared/search';

let nextId = 0;

/**
 * The build of one march clicked together (Gether 12. 10. 2026): the eight equipment slots – pick a tile, then the
 * item of that slot, its crit and iconic level – and the formation with the inscriptions of each armament (its own
 * gold and blue ones and the common white ones). Nothing is sent before "Uložiť"; the march's commanders, type,
 * screenshot and typed armament bonuses stay as they are.
 */
@Component({
  selector: 'app-build-editor',
  imports: [FormationIcon, GearGrid, Icon],
  templateUrl: './build-editor.html',
  styleUrl: './build-editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BuildEditor {
  /** the march with its new build */
  readonly saved = output<March>();

  private readonly api = inject(MarchesApi);
  private readonly armory = inject(ArmoryApi);
  protected readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.t().marches);
  protected readonly id = `build-editor-${++nextId}`;
  protected readonly index = this.armory.index;
  protected readonly failed = this.armory.failed;
  protected readonly pieces = ARMAMENT_PIECES;
  protected readonly maxInscriptions = MAX_INSCRIPTIONS;
  protected readonly iconicLevels = Array.from({ length: ICONIC_MAX + 1 }, (_, i) => i);
  protected readonly roman = roman;

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private opener: HTMLElement | null = null;

  protected readonly march = signal<March | null>(null);
  protected readonly draft = signal<Build>({ gear: {}, formation: '', inscriptions: [] });
  protected readonly tab = signal<'gear' | 'armaments'>('gear');
  protected readonly slot = signal<GearSlot>('weapon');
  protected readonly search = signal('');
  protected readonly weaker = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  open(march: March, event?: Event): void {
    this.armory.load();
    this.opener = (event?.currentTarget as HTMLElement | null) ?? null;
    this.march.set(march);
    this.draft.set(structuredClone(buildOf(march)));
    this.tab.set('gear');
    this.slot.set(GEAR_SLOTS.find((s) => !march.gear?.[s]) ?? 'weapon');
    this.search.set('');
    this.weaker.set(false);
    this.error.set(null);
    this.dialog().nativeElement.showModal();
  }

  protected close(): void {
    this.dialog().nativeElement.close();
  }

  protected closed(): void {
    this.march.set(null);
    this.opener?.focus();
  }

  // ---------------------------------------------------------------- equipment

  /** the piece in the selected slot with its item */
  protected readonly current = computed(() => {
    const piece = this.draft().gear[this.slot()];
    const item = piece && this.index()?.items.get(piece.item);
    return piece && item ? { piece, item } : null;
  });

  /** the items of the selected slot: legendary and epic, the weaker ones on request; by the search (no diacritics) */
  protected readonly items = computed(() => {
    const index = this.index();
    if (!index) return [];
    const slot = this.slot();
    const other = slot === 'accessory1' ? 'accessory2' : slot === 'accessory2' ? 'accessory1' : null;
    const taken = other ? this.draft().gear[other]?.item : undefined;
    const query = fold(this.search());
    const strong = (item: ArmoryItem) => item.rarity === 'legendary' || item.rarity === 'epic';
    return index.data.items
      .filter((item) => item.slot === itemSlot(slot) && item.id !== taken)
      .filter((item) => (query ? fold(item.name).includes(query) : this.weaker() || strong(item)))
      .sort((a, b) => ITEM_RARITIES.indexOf(a.rarity) - ITEM_RARITIES.indexOf(b.rarity) || a.name.localeCompare(b.name));
  });

  protected choose(item: ArmoryItem): void {
    const slot = this.slot();
    const before = this.draft().gear[slot];
    // the same item keeps its crit and iconic level
    const piece = before?.item === item.id ? before : { item: item.id, crit: false, iconic: 0 };
    this.draft.update((d) => ({ ...d, gear: { ...d.gear, [slot]: piece } }));
    this.error.set(null);
  }

  /** after an item is picked: on to the next empty slot */
  protected next(): void {
    const gear = this.draft().gear;
    const start = GEAR_SLOTS.indexOf(this.slot());
    const empty = [...GEAR_SLOTS.slice(start + 1), ...GEAR_SLOTS.slice(0, start)].find((s) => !gear[s]);
    if (empty) this.pickSlot(empty);
  }

  protected pickSlot(slot: GearSlot): void {
    this.slot.set(slot);
    this.search.set('');
  }

  protected setCrit(crit: boolean): void {
    this.patchPiece({ crit });
  }

  protected setIconic(iconic: number): void {
    this.patchPiece({ iconic });
  }

  private patchPiece(change: { crit?: boolean; iconic?: number }): void {
    const slot = this.slot();
    this.draft.update((d) => {
      const piece = d.gear[slot];
      return piece ? { ...d, gear: { ...d.gear, [slot]: { ...piece, ...change } } } : d;
    });
  }

  protected clearSlot(): void {
    const slot = this.slot();
    this.draft.update((d) => {
      const gear = { ...d.gear };
      delete gear[slot];
      return { ...d, gear };
    });
  }

  /** what the equipment gives the march's troops, live */
  protected readonly gearStats = computed(() => {
    const index = this.index();
    const march = this.march();
    if (!index || !march || !Object.keys(this.draft().gear).length) return null;
    const totals = gearTotals(index, this.draft().gear);
    const troop = troopOf(march.kind, totals.stats);
    const b = this.t().build;
    return {
      title: b.gearStats.replace('{troop}', b.troops[troop]),
      values: TROOP_STATS.map((stat) => ({ stat, label: b.stats[stat], value: troopStat(totals.stats, troop, stat) })).filter(
        (s) => s.value > 0 || s.stat !== 'march_speed',
      ),
    };
  });

  // ---------------------------------------------------------------- armaments

  protected readonly formations = computed(() => this.index()?.data.formations ?? []);

  /** each armament: the formation's own inscriptions (gold, blue) and the common ones */
  protected readonly armaments = computed(() => {
    const index = this.index();
    if (!index) return [];
    const own = index.formations.get(this.draft().formation)?.inscriptions ?? [];
    return ARMAMENT_PIECES.map((piece) => ({
      piece,
      inscriptions: [...own.filter((i) => i.piece === piece), ...index.data.common.filter((i) => i.piece === piece)],
    }));
  });

  protected readonly full = computed(() => this.draft().inscriptions.length >= MAX_INSCRIPTIONS);

  protected setFormation(id: string): void {
    const index = this.index();
    if (!index) return;
    const formation = this.draft().formation === id ? '' : id;
    // the old formation's own inscriptions go, the common ones stay
    const common = new Set(index.data.common.map((i) => i.id));
    this.draft.update((d) => ({ ...d, formation, inscriptions: d.inscriptions.filter((i) => common.has(i)) }));
    this.error.set(null);
  }

  protected chosen(inscription: Inscription): boolean {
    return this.draft().inscriptions.includes(inscription.id);
  }

  protected toggle(inscription: Inscription): void {
    if (!this.chosen(inscription) && this.full()) return;
    this.draft.update((d) => ({
      ...d,
      inscriptions: this.chosen(inscription)
        ? d.inscriptions.filter((i) => i !== inscription.id)
        : [...d.inscriptions, inscription.id],
    }));
    this.error.set(null);
  }

  // ---------------------------------------------------------------- saving

  protected async save(): Promise<void> {
    const march = this.march();
    if (!march || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const updated = await this.api.update(march.id, this.draft());
      this.saved.emit(updated);
      this.close();
    } catch {
      this.error.set(this.t().build.failed);
    } finally {
      this.busy.set(false);
    }
  }
}

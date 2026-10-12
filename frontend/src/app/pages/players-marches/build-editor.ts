import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal, viewChild } from '@angular/core';
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
  MAX_PER_PIECE,
  TROOP_STATS,
  buildOf,
  emptyParts,
  gearTotals,
  itemScore,
  itemSlot,
  marchTroop,
  roman,
  troopOf,
  troopStat,
} from '../../core/armory';
import { I18n } from '../../core/i18n/i18n';
import { ARMAMENT_STATS, March, REQUIRED_STATS } from '../../core/kvk-api';
import { MarchChange, MarchesApi } from '../../core/marches-api';
import { FormationIcon } from '../../shared/formation-icon';
import { GearGrid } from '../../shared/gear-grid';
import { SetBonuses } from '../../shared/set-bonuses';
import { Icon } from '../../shared/icon';
import { fold } from '../../shared/search';
import { formatBonus, readBonus, statLabel } from '../../shared/stat-label';

type ArmamentStat = (typeof ARMAMENT_STATS)[number];
/** the build and the armament bonuses typed in (null = empty field) */
type Draft = Build & { stats: Record<ArmamentStat, number | null> };

let nextId = 0;

/**
 * The build of one march clicked together (Gether 12. 10. 2026): the eight equipment slots – pick a tile, then the
 * item of that slot, its crit and iconic level – and the armaments: ATK, DEF, HP and All DMG typed in, the formation
 * and the inscriptions of each armament (its own gold and blue ones and the common white ones, two of each armament).
 * Nothing is sent before "Uložiť"; the march's type and commanders are edited on the card (pencil).
 */
@Component({
  selector: 'app-build-editor',
  imports: [FormationIcon, GearGrid, Icon, SetBonuses],
  templateUrl: './build-editor.html',
  styleUrl: './build-editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BuildEditor {
  /** the march with its new build */
  readonly saved = output<March>();
  /** how the build is saved: a march by default; a KvK sign-up passes its own (PATCH /api/kvk/signup/) */
  readonly saveWith = input<((march: March, change: MarchChange) => Promise<March>) | null>(null);

  private readonly api = inject(MarchesApi);
  private readonly armory = inject(ArmoryApi);
  protected readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.t().marches);
  protected readonly id = `build-editor-${++nextId}`;
  protected readonly index = this.armory.index;
  protected readonly failed = this.armory.failed;
  protected readonly pieces = ARMAMENT_PIECES;
  protected readonly maxPerPiece = MAX_PER_PIECE;
  protected readonly iconicLevels = Array.from({ length: ICONIC_MAX + 1 }, (_, i) => i);
  protected readonly roman = roman;

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private opener: HTMLElement | null = null;

  protected readonly march = signal<March | null>(null);
  protected readonly draft = signal<Draft>({
    gear: {},
    formation: '',
    inscriptions: [],
    stats: { attack: null, defense: null, health: null, damage: null },
  });
  protected readonly armamentStats = ARMAMENT_STATS;
  protected readonly bonus = formatBonus;
  protected readonly tab = signal<'gear' | 'armaments'>('gear');
  protected readonly slot = signal<GearSlot>('weapon');
  protected readonly search = signal('');
  protected readonly weaker = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  /**
   * `opener` gets the focus back on close (the clicked button, or the new card's after a new march); `slot` opens
   * the equipment on that slot (a tile clicked on the card), else on the first empty one
   */
  open(march: March, opener?: Event | HTMLElement | null, slot?: GearSlot, tab: 'gear' | 'armaments' = 'gear'): void {
    this.armory.load();
    // without one the focused element (a tile of the card) gets the focus back
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.opener = opener instanceof Event ? (opener.currentTarget as HTMLElement | null) : (opener ?? focused);
    this.march.set(march);
    const stats = Object.fromEntries(ARMAMENT_STATS.map((stat) => [stat, march[stat] ?? null])) as Draft['stats'];
    this.draft.set({ ...structuredClone(buildOf(march)), stats });
    this.tab.set(tab);
    this.slot.set(slot ?? GEAR_SLOTS.find((s) => !march.gear?.[s]) ?? 'weapon');
    this.search.set('');
    this.weaker.set(false);
    this.error.set(null);
    this.statsMissing.set(false);
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

  /**
   * the items of the selected slot: legendary and epic, the weaker ones on request; by the search (no diacritics). The
   * ones giving the march's troops the most come first (Gether 12. 10. 2026), then by rarity and name.
   */
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
      .map((item) => ({ item, score: itemScore(item, this.troop()) }))
      .sort(
        (a, b) =>
          b.score - a.score ||
          ITEM_RARITIES.indexOf(a.item.rarity) - ITEM_RARITIES.indexOf(b.item.rarity) ||
          a.item.name.localeCompare(b.item.name),
      )
      .map(({ item }) => item);
  });

  /** the troops of the march: its type, a rally or garrison those its equipment raises most */
  private readonly troop = computed(() => troopOf(this.march()?.kind ?? '', this.totals()?.stats ?? {}));

  /** the crit badge of every item: the march's troops */
  protected readonly critTroop = computed(() => marchTroop(this.march()?.kind ?? '', this.totals()?.stats ?? {}));

  protected choose(item: ArmoryItem): void {
    const slot = this.slot();
    const before = this.draft().gear[slot];
    // the same item keeps its crit and iconic level
    const piece = before?.item === item.id ? before : { item: item.id, crit: false, iconic: 0 };
    this.draft.update((d) => ({ ...d, gear: { ...d.gear, [slot]: piece } }));
    this.error.set(null);
  }

  /**
   * On a phone the keyboard covers half the sheet: the search moves to the top of the dialog, the items found right
   * under it (Gether 12. 10. 2026: "nájdené itemy sú skryté"). After the keyboard has opened.
   */
  protected searchFocused(input: HTMLInputElement): void {
    if (!matchMedia('(max-width: 719px)').matches) return;
    setTimeout(() => input.scrollIntoView({ block: 'start', behavior: this.reducedMotion ? 'auto' : 'smooth' }), 300);
  }

  private readonly reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

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

  /** what the equipment gives the march's troops, live; a 0 is left out */
  protected readonly gearStats = computed(() => {
    const totals = this.totals();
    const march = this.march();
    if (!totals || !march) return null;
    const troop = troopOf(march.kind, totals.stats);
    const b = this.t().build;
    const values = TROOP_STATS.map((stat) => ({ stat, label: b.stats[stat], value: troopStat(totals.stats, troop, stat) }));
    const shown = values.filter((s) => s.value > 0);
    return shown.length ? { title: b.gearStats.replace('{troop}', b.troops[troop]), values: shown } : null;
  });

  private readonly totals = computed(() => {
    const index = this.index();
    return index ? gearTotals(index, this.draft().gear) : null;
  });

  /** the sets worn – their bonuses reached are written under the equipment */
  protected readonly worn = computed(() => this.totals()?.sets ?? []);

  /** the slots filled, on the Výbava tab */
  protected readonly gearCount = computed(() => Object.keys(this.draft().gear).length);

  /** no formation and no inscription – the Armamenty tab is red, like the empty Výbava */
  protected readonly armamentsEmpty = computed(() => emptyParts(this.draft()).armaments);

  // ---------------------------------------------------------------- armaments

  /** the required bonuses are still empty after "Uložiť" – their fields are marked */
  protected readonly statsMissing = signal(false);

  /** "Cav ATK" for a cavalry march */
  protected statLabel(stat: ArmamentStat): string {
    return statLabel(this.t(), this.march()?.kind ?? '', stat);
  }

  /** one decimal at most (Gether 12. 10. 2026); anything else typed is dropped at once */
  protected setStat(stat: ArmamentStat, event: Event): void {
    const value = readBonus(event.target as HTMLInputElement);
    this.draft.update((d) => ({ ...d, stats: { ...d.stats, [stat]: value } }));
    this.statsMissing.set(false);
    this.error.set(null);
  }

  protected readonly formations = computed(() => this.index()?.data.formations ?? []);
  /** the chosen formation's name next to the heading – the picker shows only icons */
  protected readonly formationName = computed(() => this.index()?.formations.get(this.draft().formation)?.name ?? '');

  /** each armament: the formation's own inscriptions (gold, blue) and the common ones, how many are chosen (max. 2) */
  protected readonly armaments = computed(() => {
    const index = this.index();
    if (!index) return [];
    const own = index.formations.get(this.draft().formation)?.inscriptions ?? [];
    const chosen = this.draft().inscriptions.map((id) => index.inscriptions.get(id)?.piece);
    return ARMAMENT_PIECES.map((piece) => {
      const count = chosen.filter((p) => p === piece).length;
      return {
        piece,
        count,
        full: count >= MAX_PER_PIECE,
        inscriptions: [...own.filter((i) => i.piece === piece), ...index.data.common.filter((i) => i.piece === piece)],
      };
    });
  });

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
    const piece = this.armaments().find((a) => a.piece === inscription.piece);
    if (!this.chosen(inscription) && piece?.full) return;
    this.draft.update((d) => ({
      ...d,
      inscriptions: this.chosen(inscription)
        ? d.inscriptions.filter((i) => i !== inscription.id)
        : [...d.inscriptions, inscription.id],
    }));
    this.error.set(null);
  }

  // ---------------------------------------------------------------- saving

  /** the build without ids the catalog no longer knows (a later fetch_armory may drop one) – they would block saving */
  private known(): Build {
    const index = this.index();
    const { gear, formation, inscriptions } = this.draft();
    if (!index) return { gear, formation, inscriptions };
    return {
      gear: Object.fromEntries(Object.entries(gear).filter(([, piece]) => piece && index.items.has(piece.item))),
      formation: index.formations.has(formation) ? formation : '',
      inscriptions: inscriptions.filter((id) => index.inscriptions.has(id)),
    };
  }

  /** "stav k októbru 2026" */
  protected sourceDate(verified: string): string {
    const [year, month] = verified.split('-').map(Number);
    return `${this.t().build.months[month - 1] ?? ''} ${year}`.trim();
  }

  /** ATK, DEF and HP are required (0 counts), an empty All DMG is saved as 0 */
  protected async save(): Promise<void> {
    const march = this.march();
    if (!march || this.busy()) return;
    const stats = this.draft().stats;
    if (REQUIRED_STATS.some((stat) => stats[stat as ArmamentStat] === null)) {
      this.tab.set('armaments');
      this.statsMissing.set(true);
      this.error.set(this.t().required.statsMarch);
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const change = { ...this.known(), ...stats, damage: stats.damage ?? 0 };
      const save = this.saveWith();
      const updated = save ? await save(march, change) : await this.api.update(march.id, change);
      this.saved.emit(updated);
      this.close();
    } catch {
      this.error.set(this.t().build.failed);
    } finally {
      this.busy.set(false);
    }
  }
}

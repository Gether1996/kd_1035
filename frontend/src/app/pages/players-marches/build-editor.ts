import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  PLATFORM_ID,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  ARMAMENT_ICONS,
  ARMAMENT_PIECES,
  ARMAMENT_WHEEL,
  ArmamentPiece,
  ArmoryApi,
  ArmoryItem,
  Build,
  GEAR_SLOTS,
  GearSlot,
  ICONIC_MAX,
  ITEM_RARITIES,
  INSCRIPTION_RARITIES,
  Inscription,
  MAX_PER_PIECE,
  MAX_RARE_PER_PIECE,
  TROOP_STATS,
  buildOf,
  emptyParts,
  gearTotals,
  isRareInscription,
  itemScore,
  itemSlot,
  marchTroop,
  roman,
  troopOf,
  troopStat,
} from '../../core/armory';
import { I18n } from '../../core/i18n/i18n';
import { ARMAMENT_STATS, ArmamentStat, March, REQUIRED_STATS, overCaps } from '../../core/kvk-api';
import { MarchChange, MarchesApi } from '../../core/marches-api';
import { FormationIcon } from '../../shared/formation-icon';
import { GearGrid } from '../../shared/gear-grid';
import { SetBonuses } from '../../shared/set-bonuses';
import { Icon } from '../../shared/icon';
import { fold } from '../../shared/search';
import { formatBonus, overCapText, readBonus, statLabel } from '../../shared/stat-label';

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
  styleUrls: ['./build-editor.scss', './armament-wheel.scss'],
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
  protected readonly wheel = ARMAMENT_WHEEL;
  protected readonly pieceIcons = ARMAMENT_ICONS;
  protected readonly maxPerPiece = MAX_PER_PIECE;
  protected readonly iconicLevels = Array.from({ length: ICONIC_MAX + 1 }, (_, i) => i);
  protected readonly roman = roman;

  private readonly injector = inject(Injector);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly keepButton = viewChild<ElementRef<HTMLButtonElement>>('keep');
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
   * Unsaved changes are not thrown away without asking (Esc, X, "Zrušiť", a reload): minutes of clicking gone with
   * one stray Esc. `initial` is the build as opened or last saved; both sides are compared in the shape "Uložiť"
   * sends, so an untouched editor is never dirty (ids the catalog dropped, null vs 0 All DMG, order).
   */
  private readonly initial = signal<Draft | null>(null);
  protected readonly dirty = computed(() => {
    const initial = this.initial();
    return !!initial && this.shape(this.draft()) !== this.shape(initial);
  });
  /** the question "Zahodiť zmeny?" in the actions */
  protected readonly confirmDiscard = signal(false);
  /** "Zahodiť zmeny" clicked: the close that follows is wanted */
  private discarding = false;
  /** what asked to close (X, Zrušiť, the element focused before Esc) – "Pokračovať v úprave" returns there */
  private returnTo: HTMLElement | null = null;
  /** closing or reloading the tab with the dirty editor open: the browser asks in its own words */
  private readonly askBeforeUnload = (e: BeforeUnloadEvent) => {
    e.preventDefault();
    // older Safari asks only with this set
    e.returnValue = true;
  };

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    effect((onCleanup) => {
      if (!this.march() || !this.dirty()) return;
      addEventListener('beforeunload', this.askBeforeUnload);
      onCleanup(() => removeEventListener('beforeunload', this.askBeforeUnload));
    });
    // the page can go while the dialog is open (Back in the browser is not blocked by the modal)
    inject(DestroyRef).onDestroy(() => removeEventListener('beforeunload', this.askBeforeUnload));
  }

  /**
   * `opener` gets the focus back on close (the clicked button, or the new card's after a new march); `slot` opens
   * the equipment on that slot (a tile clicked on the card), else on the first empty one; `piece` opens that armament
   * (its two gold or blue inscriptions, "Oprav armamenty")
   */
  open(
    march: March,
    opener?: Event | HTMLElement | null,
    slot?: GearSlot,
    tab: 'gear' | 'armaments' = 'gear',
    piece: ArmamentPiece | null = null,
  ): void {
    this.armory.load();
    // without one the focused element (a tile of the card) gets the focus back
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.opener = opener instanceof Event ? (opener.currentTarget as HTMLElement | null) : (opener ?? focused);
    this.march.set(march);
    const stats = Object.fromEntries(ARMAMENT_STATS.map((stat) => [stat, march[stat] ?? null])) as Draft['stats'];
    this.draft.set({ ...structuredClone(buildOf(march)), stats });
    this.tab.set(tab);
    this.slot.set(slot ?? GEAR_SLOTS.find((s) => !march.gear?.[s]) ?? 'weapon');
    this.armPicked.set(piece);
    this.search.set('');
    this.weaker.set(false);
    this.error.set(null);
    this.statsMissing.set(false);
    this.confirmDiscard.set(false);
    this.discarding = false;
    this.initial.set(this.draft());
    this.dialog().nativeElement.showModal();
  }

  /** Esc: a clean editor closes at once, a dirty one asks first */
  protected cancel(event: Event): void {
    event.preventDefault();
    this.requestClose(document.activeElement);
  }

  /** X and "Zrušiť" (`from` = the button) */
  protected requestClose(from: EventTarget | Element | null): void {
    if (!this.dirty()) return this.close();
    this.askDiscard(from instanceof HTMLElement ? from : null);
  }

  private askDiscard(from: HTMLElement | null): void {
    // a second Esc while asking (the focus on its answers) keeps the first place to return to
    if (from?.closest('.be__discard')) from = null;
    if (!this.confirmDiscard() || from) this.returnTo = from;
    this.confirmDiscard.set(true);
    // the question is read out (role="alert"); the focus waits on the harmless answer
    afterNextRender({ write: () => this.keepButton()?.nativeElement.focus() }, { injector: this.injector });
  }

  /** "Pokračovať v úprave": every change stays, the focus goes back where the player was */
  protected keepEditing(): void {
    this.confirmDiscard.set(false);
    const back = this.returnTo?.isConnected ? this.returnTo : null;
    this.returnTo = null;
    afterNextRender(
      { write: () => (back ?? this.dialog().nativeElement.querySelector<HTMLElement>('.modal__close'))?.focus() },
      { injector: this.injector },
    );
  }

  /** "Zahodiť zmeny" */
  protected discard(): void {
    this.discarding = true;
    this.close();
  }

  protected close(): void {
    this.dialog().nativeElement.close();
  }

  protected closed(): void {
    // closed without a cancel we could stop (Chrome's second Esc without a click between, the Android back gesture):
    // open again with the changes and ask
    if (this.march() && this.dirty() && !this.discarding) {
      this.dialog().nativeElement.showModal();
      this.askDiscard(null);
      return;
    }
    removeEventListener('beforeunload', this.askBeforeUnload);
    this.discarding = false;
    this.confirmDiscard.set(false);
    this.returnTo = null;
    this.initial.set(null);
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
    // the same item keeps its crit and iconic level; a new gold one starts at iconic I (Gether 13. 10. 2026)
    const piece = before?.item === item.id ? before : { item: item.id, crit: false, iconic: item.iconic ? 1 : 0 };
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

  /** the bonuses typed over their cap (Gether 19. 10. 2026) – red, but saved: the march then says so in red */
  protected readonly overCap = computed(() => overCaps(this.draft().stats));
  protected readonly overCapText = computed(() => {
    const over = this.overCap();
    return over.length ? this.t().statsProblem.replace('{stats}', overCapText(this.t(), this.draft().stats, over)) : '';
  });

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

  /** the chosen formation, in the middle of the armaments */
  protected readonly formation = computed(() => this.index()?.formations.get(this.draft().formation) ?? null);

  /**
   * each armament in the game's places (ARMAMENT_WHEEL): the formation's own inscriptions (gold, blue) and the common
   * ones, the chosen ones (gold first) and how many (max. 2)
   */
  protected readonly armaments = computed(() => {
    const index = this.index();
    if (!index) return [];
    const own = index.formations.get(this.draft().formation)?.inscriptions ?? [];
    const chosen = this.draft()
      .inscriptions.map((id) => index.inscriptions.get(id))
      .filter((i): i is Inscription => !!i)
      .sort((a, b) => INSCRIPTION_RARITIES.indexOf(a.rarity) - INSCRIPTION_RARITIES.indexOf(b.rarity));
    return ARMAMENT_WHEEL.map((piece) => {
      const mine = chosen.filter((i) => i.piece === piece);
      const rare = mine.filter(isRareInscription);
      return {
        piece,
        count: mine.length,
        chosen: mine,
        full: mine.length >= MAX_PER_PIECE,
        /** the gold or blue one chosen – a second one takes its place */
        rare: rare[0] ?? null,
        /** saved before the rule: two gold or blue, one has to go before saving */
        tooRare: rare.length > MAX_RARE_PER_PIECE,
        inscriptions: [...own.filter((i) => i.piece === piece), ...index.data.common.filter((i) => i.piece === piece)],
      };
    });
  });

  /**
   * The part of the armaments open below them, like a tap on the game's Armament screen (Gether 1. 11. 2026): the one
   * clicked, else the formation while there is none, then the first armament not full yet. Picking an inscription
   * keeps the part open – it does not jump to the next one under the cursor.
   */
  private readonly armPicked = signal<ArmamentPiece | 'formation' | null>(null);
  protected readonly armSlot = computed<ArmamentPiece | 'formation'>(() => {
    const picked = this.armPicked();
    if (picked) return picked;
    if (!this.draft().formation) return 'formation';
    return this.armaments().find((a) => !a.full)?.piece ?? ARMAMENT_WHEEL[0];
  });
  protected readonly armOpen = computed(() => {
    const slot = this.armSlot();
    return slot === 'formation' ? null : (this.armaments().find((a) => a.piece === slot) ?? null);
  });

  protected pickArm(slot: ArmamentPiece | 'formation'): void {
    this.armPicked.set(slot);
  }

  protected setFormation(id: string): void {
    const index = this.index();
    if (!index) return;
    const formation = this.draft().formation === id ? '' : id;
    // the old formation's own inscriptions go, the common ones stay
    const common = new Set(index.data.common.map((i) => i.id));
    this.draft.update((d) => ({ ...d, formation, inscriptions: d.inscriptions.filter((i) => common.has(i)) }));
    // a formation picked: on to its armaments, the first one not full (like the game: the formation first)
    this.armPicked.set(formation ? (this.armaments().find((a) => !a.full)?.piece ?? ARMAMENT_WHEEL[0]) : 'formation');
    this.error.set(null);
  }

  protected chosen(inscription: Inscription): boolean {
    return this.draft().inscriptions.includes(inscription.id);
  }

  /** the gold or blue one a pick would replace (one of them per armament), null = added beside the others */
  private replaces(inscription: Inscription): Inscription | null {
    if (this.chosen(inscription) || !isRareInscription(inscription)) return null;
    return this.armaments().find((a) => a.piece === inscription.piece)?.rare ?? null;
  }

  /** cannot be picked: the armament is full and the pick would not just swap its gold or blue one */
  protected blocked(inscription: Inscription): boolean {
    const piece = this.armaments().find((a) => a.piece === inscription.piece);
    return !this.chosen(inscription) && !!piece?.full && !this.replaces(inscription);
  }

  protected toggle(inscription: Inscription): void {
    if (this.blocked(inscription)) return;
    const replaced = this.replaces(inscription);
    this.armPicked.set(inscription.piece);
    this.draft.update((d) => ({
      ...d,
      inscriptions: this.chosen(inscription)
        ? d.inscriptions.filter((i) => i !== inscription.id)
        : [...d.inscriptions.filter((i) => i !== replaced?.id), inscription.id],
    }));
    this.error.set(null);
  }

  // ---------------------------------------------------------------- saving

  /** the build without ids the catalog no longer knows (a later fetch_armory may drop one) – they would block saving */
  private known(draft: Build = this.draft()): Build {
    const index = this.index();
    const { gear, formation, inscriptions } = draft;
    if (!index) return { gear, formation, inscriptions };
    return {
      gear: Object.fromEntries(Object.entries(gear).filter(([, piece]) => piece && index.items.has(piece.item))),
      formation: index.formations.has(formation) ? formation : '',
      inscriptions: inscriptions.filter((id) => index.inscriptions.has(id)),
    };
  }

  /** a draft as "Uložiť" would send it, in a fixed order – for `dirty` */
  private shape(draft: Draft): string {
    const { gear, formation, inscriptions } = this.known(draft);
    return JSON.stringify([
      GEAR_SLOTS.map((slot) => {
        const piece = gear[slot];
        return piece ? [piece.item, !!piece.crit, piece.iconic ?? 0] : null;
      }),
      formation,
      [...inscriptions].sort(),
      ARMAMENT_STATS.map((stat) => draft.stats[stat] ?? (stat === 'damage' ? 0 : null)),
    ]);
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
    const tooRare = this.armaments().find((a) => a.tooRare);
    if (tooRare) {
      this.tab.set('armaments');
      this.armPicked.set(tooRare.piece);
      this.error.set(this.t().build.oneRare);
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const change = { ...this.known(), ...stats, damage: stats.damage ?? 0 };
      const save = this.saveWith();
      const updated = save ? await save(march, change) : await this.api.update(march.id, change);
      // saved: closing does not ask
      this.initial.set(this.draft());
      this.saved.emit(updated);
      this.close();
    } catch {
      this.error.set(this.t().build.failed);
    } finally {
      this.busy.set(false);
    }
  }
}

import { NgTemplateOutlet, isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse, httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  PLATFORM_ID,
  afterNextRender,
  computed,
  inject,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { emptyParts, hasBuild } from '../../core/armory';
import { I18n } from '../../core/i18n/i18n';
import { March, REQUIRED_STATS, marchHasProblem } from '../../core/kvk-api';
import { MarchCommander, MarchesApi, marchCommandersUrl } from '../../core/marches-api';
import { Icon } from '../../shared/icon';
import { ArmyDraft, ArmyError, MarchFields, armyDraft, armyError } from '../../shared/march-fields';
import { MarchBuild } from '../../shared/march-build';
import { BuildEditor } from '../players-marches/build-editor';

/** The march being edited: a new one (id null) or a saved one; nothing is sent before "Uložiť". */
type Draft = ArmyDraft & { id: number | null };

/**
 * The player's marches on /marche – "Prehľad marchov" (Gether 12. 10. 2026: "Moje marche" merged into it,
 * no equipment screenshot): up to 10 marches (7 before), each a card with its equipment and armaments (MarchBuild).
 * A march is filled in (MarchFields: type, commanders and their skills) and saved – a new one goes on to its equipment
 * and armaments right away (BuildEditor: ATK, DEF, HP, All DMG there too, the inscription counts follow from it); only
 * then the next one can be added.
 * Seen by the player, the reviewers (R4) and the superuser – and every signed-in player when the player makes them
 * public.
 */
@Component({
  selector: 'app-marches',
  imports: [BuildEditor, Icon, MarchBuild, MarchFields, NgTemplateOutlet],
  templateUrl: './marches.html',
  styleUrls: ['../kvk/kvk.scss', './marches.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Marches {
  private readonly api = inject(MarchesApi);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  protected readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.t().marches);

  private readonly data = this.api.list();
  protected readonly loaded = computed(() => this.data.hasValue());
  protected readonly failed = computed(() => !!this.data.error());
  protected readonly marches = linkedSignal<March[]>(() => (this.data.hasValue() ? this.data.value().marches : []));
  protected readonly max = computed(() => (this.data.hasValue() ? this.data.value().max : 10));
  /** who sees the marches: every signed-in player (true) or only R4 and the superuser */
  protected readonly isPublic = linkedSignal(() => (this.data.hasValue() ? this.data.value().public : false));
  protected readonly visibilityFailed = signal(false);
  /** "Do vyhodnocovania KvK sa počíta 5 najsilnejších marchov typu …" (the best X by score, Premenné) */
  protected readonly counted = computed(() => {
    const counting = this.data.hasValue() ? this.data.value().counting : undefined;
    if (!counting?.kinds.length) return null;
    const t = this.t().order;
    const lang = this.i18n.lang();
    const rule = new Intl.PluralRules(lang).select(counting.count);
    const first = rule === 'one' ? t.first.one : rule === 'few' ? t.first.few : t.first.other;
    const names = counting.kinds.map((kind) => this.t().kinds[kind].toLocaleLowerCase(lang));
    const kinds = names.length > 1 ? `${names.slice(0, -1).join(', ')} ${t.and} ${names.at(-1)}` : names[0];
    return t.counted.replace('{first}', first.replace('{n}', String(counting.count))).replace('{kinds}', kinds);
  });

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  /** every commander a march may name with its portrait (backend/guides/roster.py) */
  private readonly commanderData = httpResource<MarchCommander[]>(() => (this.isBrowser ? marchCommandersUrl : undefined));
  protected readonly allCommanders = computed(() => (this.commanderData.hasValue() ? this.commanderData.value() : []));
  // every portrait – a march saved before a commander was left out keeps its picture
  protected readonly portraits = computed(() => new Map(this.allCommanders().map((c) => [c.name, c.icon])));

  protected readonly draft = signal<Draft | null>(null);
  protected readonly draftError = signal<ArmyError | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly armed = signal<number | null>(null);
  private readonly buildEditor = viewChild.required(BuildEditor);
  /**
   * marches with something red: the bonuses missing (saved before they were required, v1.15.1), no item or no armament
   * at all (Gether 12. 10. 2026) – the owner is asked to fill them in
   */
  protected readonly incomplete = computed(
    () =>
      this.marches().filter((m) => {
        const empty = emptyParts(m);
        return empty.gear || empty.armaments || REQUIRED_STATS.some((stat) => m[stat] == null);
      }).length,
  );
  /**
   * marches with a pair or a formation the KvK evaluation does not like – the red border alone is easy to scroll past
   * with 8 marches
   */
  protected readonly toFix = computed(() => this.marches().filter(marchHasProblem).length);
  /** a new march can be added once nothing is being edited */
  protected readonly canAdd = computed(() => !this.draft() && this.marches().length < this.max());

  protected async setPublic(value: boolean): Promise<void> {
    if (value === this.isPublic()) return;
    const before = this.isPublic();
    this.isPublic.set(value);
    this.visibilityFailed.set(false);
    try {
      await this.api.setPublic(value);
    } catch {
      this.isPublic.set(before);
      this.visibilityFailed.set(true);
    }
  }

  protected addLabel(): string {
    const ordinals = this.t().ordinals;
    return this.t().add.replace('{n}', ordinals[this.marches().length] ?? String(this.marches().length + 1));
  }

  /** the number of the march being edited */
  protected draftPosition(): number {
    const draft = this.draft();
    return (draft?.id && this.marches().find((m) => m.id === draft.id)?.position) || this.marches().length + 1;
  }

  // ---------------------------------------------------------------- editing

  protected add(): void {
    if (!this.canAdd()) return;
    this.draft.set({ id: null, ...armyDraft() });
    this.draftError.set(null);
  }

  protected edit(march: March): void {
    if (this.draft()) return;
    this.draft.set({ id: march.id, ...armyDraft(march) });
    this.draftError.set(null);
  }

  protected cancel(): void {
    this.armed.set(null);
    this.draft.set(null);
    this.draftError.set(null);
  }

  /** a change in MarchFields */
  protected update(value: ArmyDraft): void {
    this.draft.update((d) => (d ? { ...d, ...value } : d));
    this.draftError.set(null);
  }

  /** type and commanders; a new march goes on to its equipment and armaments (with ATK, DEF, HP) right away */
  protected async save(): Promise<void> {
    const draft = this.draft();
    if (!draft || this.busy()) return;
    const missing = armyError(draft);
    if (missing) return this.draftError.set(missing);
    const change = {
      kind: draft.kind,
      primary: draft.primary,
      secondary: draft.secondary,
      primary_skills: draft.skills.primary,
      secondary_skills: draft.skills.secondary,
    };
    await this.run(async () => {
      const march = draft.id === null ? await this.api.add(change) : await this.api.update(draft.id, change);
      this.store(march);
      this.draft.set(null);
      if (draft.id !== null) return;
      // once the new card is there: its build button gets the focus back when the editor closes
      afterNextRender(
        () => {
          const button = this.host.nativeElement.querySelector<HTMLElement>(`[data-march="${march.id}"] .march__build`);
          this.buildEditor().open(march, button);
        },
        { injector: this.injector },
      );
    });
  }

  /** the march has its equipment or armaments clicked together */
  protected built(march: March): boolean {
    return hasBuild(march);
  }

  /** a new or changed march into the list */
  protected store(march: March): void {
    this.marches.update((list) =>
      list.some((m) => m.id === march.id) ? list.map((m) => (m.id === march.id ? march : m)) : [...list, march],
    );
  }

  /**
   * One place up (-1) or down (1) – the KvK evaluation counts the first X in the player's order. The list moves at
   * once and goes back when the server says no (a stale order from another tab: the list is loaded again).
   */
  protected async move(march: March, step: -1 | 1): Promise<void> {
    if (this.draft() || this.busy()) return;
    const before = this.marches();
    const from = before.findIndex((m) => m.id === march.id);
    const to = from + step;
    if (from < 0 || to < 0 || to >= before.length) return;
    const order = [...before];
    [order[from], order[to]] = [order[to], order[from]];
    this.marches.set(order.map((m, i) => ({ ...m, position: i + 1 })));
    this.refocus(march.id, step);
    await this.run(async () => {
      try {
        this.marches.set((await this.api.reorder(order.map((m) => m.id))).marches);
      } catch (error) {
        this.marches.set(before);
        this.refocus(march.id, step);
        if (error instanceof HttpErrorResponse && error.status === 400) this.data.reload();
        throw error;
      }
    });
  }

  /**
   * The moved card is moved in the DOM too and its button loses the focus: the same arrow gets it back, or the other
   * one when the card became the first or the last
   */
  private refocus(id: number, step: -1 | 1): void {
    afterNextRender(
      () => {
        const card = this.host.nativeElement.querySelector(`[data-march="${id}"]`);
        const same = step < 0 ? '.march__up' : '.march__down';
        const other = step < 0 ? '.march__down' : '.march__up';
        (card?.querySelector<HTMLElement>(same) ?? card?.querySelector<HTMLElement>(other))?.focus();
      },
      { injector: this.injector },
    );
  }

  /** "Na opravu pre vyhodnocovanie KvK: 2": the first such card comes into view and its first control gets the focus */
  protected showFirstProblem(): void {
    const card = this.host.nativeElement.querySelector<HTMLElement>('app-march-build.is-bad-pair');
    if (!card) return;
    card.scrollIntoView({ block: 'start', behavior: this.reducedMotion ? 'auto' : 'smooth' });
    card.querySelector<HTMLElement>('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')?.focus({ preventScroll: true });
  }

  private readonly reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** "Odstrániť" in the editor of a saved march; the second click removes it */
  protected async removeDraft(): Promise<void> {
    const draft = this.draft();
    if (draft?.id == null || this.busy()) return;
    const id = draft.id;
    if (this.armed() !== id) {
      this.armed.set(id);
      return;
    }
    this.armed.set(null);
    await this.run(async () => {
      await this.api.remove(id);
      this.draft.set(null);
      // the later marches move up on the server too
      this.marches.update((list) => list.filter((m) => m.id !== id).map((m, i) => ({ ...m, position: i + 1 })));
    });
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await action();
    } catch {
      this.error.set(this.t().failed);
    } finally {
      this.busy.set(false);
    }
  }
}

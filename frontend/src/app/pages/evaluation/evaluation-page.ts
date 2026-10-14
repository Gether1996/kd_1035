import { HttpErrorResponse, httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { ArmoryApi } from '../../core/armory';
import { Auth } from '../../core/auth';
import { I18n } from '../../core/i18n/i18n';
import { KINGDOM_ZONE } from '../../core/kingdom-zone';
import { MarchCommander, marchCommandersUrl } from '../../core/marches-api';
import { Seo } from '../../core/seo';
import { PageHeader } from '../../shared/page-header';
import { EvaluationApi, RecordChange } from './evaluation-api';
import { EvalResultsTab } from './results-tab';
import { EvalPlayer, evaluate } from './scoring';
import { EvalSettings, normalizeSettings, toSave } from './settings';
import { EvalSettingsTab } from './settings-tab';
import { EVAL_TEXTS } from './texts';

type Tab = 'settings' | 'results';
/** ?tab= of the variables (the table has no query) */
const SETTINGS_QUERY = 'premenne';

/**
 * /vyhodnocovanie – the KvK evaluation of the superadmin (Gether 13. 10. 2026: the spreadsheet "KVK Requirements" on
 * the web, better). "Premenné" edits the variables, "Odhad acclaimu" shows what each player should reach from the
 * marches they clicked together; a changed variable counts in the table at once, "Uložiť" keeps it. Power is optional
 * (not asked from the players yet): when the superadmin writes it down, the marches it asks for and the excess count.
 * In the account menu of the superadmin and the players the superadmin lets in (Player.evaluator – they see approved
 * players only); a prerendered shell, not indexed, not in the sitemap.
 * Unsaved Premenné are not lost by leaving (14. 10. 2026): a link or back asks first (leave-guard.ts), closing or
 * reloading the tab gets the browser's own question – so does the full page load of a newer build (core/site-update.ts).
 */
@Component({
  selector: 'app-evaluation-page',
  imports: [PageHeader, EvalSettingsTab, EvalResultsTab],
  template: `
    @let x = texts();
    <app-page-header [crumbs]="crumbs()" [eyebrow]="x.eyebrow" [title]="x.title" [intro]="x.intro" />

    <div class="container content is-evaluation">
      @if (!auth.ready()) {
        <div class="placeholder" aria-hidden="true"></div>
      } @else if (!allowed()) {
        <p class="state">{{ x.onlySuperuser }}</p>
      } @else if (data.error()) {
        <p class="state">{{ x.loadError }}</p>
      } @else if (data.hasValue()) {
        @if (canTable() && canSettings()) {
          <div class="segmented ev-tabs" role="group" [attr.aria-label]="x.title">
            <button type="button" [attr.aria-pressed]="tab() === 'settings'" (click)="showTab('settings')">
              {{ x.tabs.settings }}@if (dirty()) {<span class="ev-dot" aria-hidden="true"></span>}
            </button>
            <button type="button" [attr.aria-pressed]="tab() === 'results'" (click)="showTab('results')">{{ x.tabs.results }}</button>
          </div>
        }
        @if (armory.failed()) {
          <p class="notice notice--error">{{ x.armoryError }}</p>
        }
        @if (tab() === 'settings') {
          <app-eval-settings
            [(settings)]="draft"
            [evaluation]="evaluation()"
            [players]="players()"
            [commanders]="commanderNames()"
            [armory]="armory.index()"
            [texts]="x"
          />
          <div class="ev-actions" role="group" [attr.aria-label]="x.tabs.settings">
            <p class="ev-actions__state" role="status">
              @if (failed()) {
                <span class="is-error">{{ stalePairs() ? x.stalePairs : unknownNames().length ? x.unknownCommanders.replace('{names}', unknownNames().join(', ')) : x.settingsFailed }}</span>
              } @else if (dirty()) {
                {{ x.dirty }}
              } @else if (savedAt(); as at) {
                {{ x.savedAt.replace('{date}', at) }}
              } @else {
                {{ x.neverSaved }}
              }
            </p>
            <button type="button" class="pill-btn" [disabled]="!dirty() || saving()" (click)="save()">
              {{ saving() ? x.saving : x.save }}
            </button>
            <button type="button" class="pill-btn pill-btn--quiet" [disabled]="!dirty() || saving()" (click)="discard()">
              {{ x.discard }}
            </button>
            <button type="button" class="pill-btn pill-btn--quiet" [disabled]="saving()" (click)="defaults()">{{ x.defaults }}</button>
          </div>
        } @else {
          <app-eval-results
            [evaluation]="evaluation()"
            [settings]="draft()"
            [armory]="armory.index()"
            [texts]="x"
            [dirty]="dirty()"
            [superuser]="superuser()"
            [failed]="recordFailed()"
            [(usePower)]="usePower"
            (record)="saveRecord($event.id, $event.change)"
            (records)="saveRecords($event)"
          />
        }
      } @else {
        <div class="placeholder" aria-hidden="true"></div>
      }
    </div>
  `,
  styleUrls: ['../reminders/reminders-page.scss', './evaluation-page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EvaluationPage {
  protected readonly i18n = inject(I18n);
  protected readonly auth = inject(Auth);
  protected readonly armory = inject(ArmoryApi);
  private readonly api = inject(EvaluationApi);
  private readonly router = inject(Router);
  protected readonly texts = computed(() => EVAL_TEXTS[this.i18n.lang()]);

  protected readonly superuser = computed(() => !!this.auth.user()?.is_superuser);
  /** the superadmin and the players let in with the switches in Hráči on /ucet (Gether 13. and 14. 10. 2026): the
   * table (the players' power, acclaim, T4) and the variables are two switches – each opens its own tab */
  protected readonly canTable = computed(() => this.superuser() || !!this.auth.user()?.evaluator);
  protected readonly canSettings = computed(() => this.superuser() || !!this.auth.user()?.evaluation_settings);
  protected readonly allowed = computed(() => this.canTable() || this.canSettings());
  protected readonly data = this.api.data(() => this.allowed());
  private readonly commanders = httpResource<MarchCommander[]>(() => (this.allowed() ? marchCommandersUrl : undefined));
  protected readonly commanderNames = computed(() => (this.commanders.hasValue() ? this.commanders.value().map((c) => c.name) : []));

  /** the players as loaded, with the notes the superadmin changed since */
  protected readonly players = linkedSignal<EvalPlayer[]>(() => (this.data.hasValue() ? this.data.value().players : []));
  /** the variables as saved on the server (normalised into the defaults) */
  private readonly saved = linkedSignal<EvalSettings>(() =>
    this.data.hasValue()
      ? normalizeSettings(this.data.value().settings, this.data.value().pairs, this.data.value().formations)
      : normalizeSettings(null),
  );
  private readonly savedIso = linkedSignal(() => (this.data.hasValue() ? this.data.value().updated_at : null));
  /** the version of the pair table this page loaded – a save of the table is refused over another one */
  private readonly pairsVersion = linkedSignal(() => (this.data.hasValue() ? this.data.value().pairs_version : ''));
  /** the same for the commanders' formations */
  private readonly formationsVersion = linkedSignal(() => (this.data.hasValue() ? this.data.value().formations_version : ''));
  /** the variables being edited – the table counts with them right away */
  protected readonly draft = linkedSignal(() => this.saved());
  protected readonly dirty = computed(() => JSON.stringify(this.draft()) !== JSON.stringify(this.saved()));
  protected readonly saving = signal(false);
  protected readonly failed = signal(false);
  /** commanders of the pair table a march cannot name – the server refused the save */
  protected readonly unknownNames = signal<string[]>([]);
  /** the pair table or the formations were changed elsewhere meanwhile – the save was refused */
  protected readonly stalePairs = signal(false);
  protected readonly recordFailed = signal(false);
  /** ?tab=premenne opens the variables, so a reload or a shared link shows them; no query = the table */
  readonly query = input<string>(undefined, { alias: 'tab' });
  /** the tab in the address, or the only one allowed (an unknown value or a tab without its switch: the allowed one) */
  protected readonly tab = computed<Tab>(() =>
    !this.canTable() ? 'settings' : !this.canSettings() ? 'results' : this.query() === SETTINGS_QUERY ? 'settings' : 'results',
  );

  /** "Rátať s power": off = the estimate from the marches only (a view switch, not saved) */
  protected readonly usePower = signal(true);
  protected readonly evaluation = computed(() => evaluate(this.draft(), this.players(), this.armory.index(), this.usePower()));

  protected readonly savedAt = computed(() => {
    const iso = this.savedIso();
    if (!iso) return null;
    return new Intl.DateTimeFormat(this.i18n.locale(), {
      day: 'numeric',
      month: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: KINGDOM_ZONE,
    }).format(new Date(iso));
  });

  protected readonly crumbs = computed(() => [
    { label: this.i18n.t().nav.home, link: this.i18n.path('home') },
    { label: this.texts().title, link: this.i18n.path('evaluation') },
  ]);

  constructor() {
    this.armory.load();
    const seo = inject(Seo);
    effect(() => seo.set({ ...this.i18n.t().seo.evaluation, noindex: true }));
    inject(DestroyRef).onDestroy(() => seo.set(null));

    // closing or reloading the tab with unsaved variables: the browser asks in its own words (no text of ours); only
    // while dirty, a clean page leaves at once (and stays in the back/forward cache)
    const injector = inject(Injector);
    afterNextRender(() => {
      effect(
        (onCleanup) => {
          if (!this.dirty()) return;
          const ask = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            // older Safari asks only with this set
            e.returnValue = true;
          };
          addEventListener('beforeunload', ask);
          onCleanup(() => removeEventListener('beforeunload', ask));
        },
        { injector },
      );
    });
  }

  /** for the route's leave guard: nothing unsaved, or the user agrees to drop it */
  canLeave(): boolean {
    return !this.dirty() || confirm(this.texts().leaveUnsaved);
  }

  /** the tab in the address without a new history entry – back leaves the page, not the tab */
  protected showTab(tab: Tab): void {
    const queryParams = { tab: tab === 'settings' ? SETTINGS_QUERY : null };
    void this.router.navigate([], { queryParams, queryParamsHandling: 'merge', replaceUrl: true });
  }

  /**
   * The variables, and the pair table only when it was changed here – over the version it was loaded in, so a table
   * changed meanwhile in the admin is not undone. The server sends the table back sorted by points (Slim 13. 10. 2026)
   * and, when this page did not touch it, as it is now.
   */
  protected async save(): Promise<void> {
    this.saving.set(true);
    this.failed.set(false);
    this.unknownNames.set([]);
    this.stalePairs.set(false);
    try {
      const body = toSave(this.draft());
      const changed = JSON.stringify(this.draft().pairs.rows) !== JSON.stringify(this.saved().pairs.rows);
      const pairs = changed ? { rows: body.pairs, version: this.pairsVersion() } : null;
      const moved = JSON.stringify(this.draft().formations.byCommander) !== JSON.stringify(this.saved().formations.byCommander);
      const formations = moved ? { map: body.formations, version: this.formationsVersion() } : null;
      const res = await this.api.saveSettings(body.settings, pairs, formations);
      this.saved.set(normalizeSettings(res.settings, res.pairs, res.formations));
      this.savedIso.set(res.updated_at);
      this.pairsVersion.set(res.pairs_version);
      this.formationsVersion.set(res.formations_version);
      this.draft.set(this.saved());
    } catch (error) {
      const answer = error instanceof HttpErrorResponse ? error.error : null;
      if (Array.isArray(answer?.names)) this.unknownNames.set(answer.names);
      this.stalePairs.set(answer?.pairs === 'stale' || answer?.formations === 'stale');
      this.failed.set(true);
    } finally {
      this.saving.set(false);
    }
  }

  protected discard(): void {
    this.draft.set(this.saved());
    this.failed.set(false);
    this.unknownNames.set([]);
    this.stalePairs.set(false);
  }

  /** the default variables – the pair table and the formations stay (they have no default in the code) – saved only
   * with "Uložiť" */
  protected defaults(): void {
    this.draft.set(normalizeSettings(null, this.draft().pairs.rows, this.draft().formations.byCommander));
  }

  /** many players at once (the power pasted for everyone): saved first, then shown */
  protected async saveRecords(list: (RecordChange & { id: number })[]): Promise<void> {
    this.recordFailed.set(false);
    try {
      const { players } = await this.api.saveRecords(list);
      const saved = new Map(players.map((p) => [p.id, p]));
      this.players.update((all) =>
        all.map((p) => {
          const s = saved.get(p.id);
          return s ? { ...p, power: s.power ?? null, acclaim: s.acclaim ?? null, t4: !!s.t4, power_bonus: s.power_bonus ?? 0 } : p;
        }),
      );
    } catch {
      this.recordFailed.set(true);
    }
  }

  /** a note about a player: shown at once, back as it was when saving fails */
  protected async saveRecord(id: number, change: RecordChange): Promise<void> {
    const before = this.players().find((p) => p.id === id);
    const put = (values: RecordChange) => this.players.update((list) => list.map((p) => (p.id === id ? { ...p, ...values } : p)));
    put(change);
    this.recordFailed.set(false);
    try {
      const saved = await this.api.saveRecord(id, change);
      put({ power: saved.power, acclaim: saved.acclaim, t4: saved.t4, power_bonus: saved.power_bonus });
    } catch {
      if (before) put({ power: before.power, acclaim: before.acclaim, t4: before.t4, power_bonus: before.power_bonus });
      this.recordFailed.set(true);
    }
  }
}

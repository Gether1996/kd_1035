import { ViewportScroller } from '@angular/common';
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
import { EvalEquipmentTab } from './equipment-tab';
import { EvaluationApi, RecordChange } from './evaluation-api';
import { Overview, overviewChanges, overviewRows } from './overview';
import { EvalOverviewTab } from './overview-tab';
import { EvalResultsTab } from './results-tab';
import { EvalPlayer, evaluate } from './scoring';
import { EvalSettings, normalizeSettings, toSave } from './settings';
import { EvalSettingsTab } from './settings-tab';
import { EVAL_TEXTS } from './texts';

type Tab = 'settings' | 'results' | 'overview' | 'equipment';
/** ?tab= of the variables, the published overview and "Top 5 equip" (the table has none, only its quick filter ?f=) */
const QUERY: Record<Tab, string | null> = { settings: 'premenne', results: null, overview: 'prehlad', equipment: 'vybava' };
/** the order of the tab buttons */
const TABS: Tab[] = ['settings', 'results', 'overview', 'equipment'];

/**
 * /vyhodnocovanie – the KvK evaluation of the superadmin (Gether 13. 10. 2026: the spreadsheet "KVK Requirements" on
 * the web, better). "Premenné" edits the variables, "Odhad acclaimu" shows what each player should reach from the
 * marches they clicked together; a changed variable counts in the table at once, "Uložiť" keeps it. Power is optional
 * (not asked from the players yet): when the superadmin writes it down, the marches it asks for and the excess count.
 * "Požadovaný acclaim" (Gether 14. 10. 2026) is what an evaluator published from the table: a plain overview, the only
 * tab of a player with the overview switch. In the account menu of the superadmin and the players the superadmin lets
 * in (Player.evaluation_settings; the published overview every approved player, Gether 23. 10. 2026 – they see approved
 * players only); a prerendered shell,
 * not indexed, not in the sitemap.
 * Unsaved Premenné are not lost by leaving (14. 10. 2026): a link or back asks first (leave-guard.ts), closing or
 * reloading the tab gets the browser's own question – so does the full page load of a newer build (core/site-update.ts).
 * ?hrac=<id> (the "Vyhodnocovanie" link of a player on /marche, 14. 10. 2026) opens that player's row of the table, or
 * highlights it in the overview, and scrolls to it once after the load.
 * "Top 5 equip" (Gether 19. 10. 2026) is R4's (Player.kvk_reviewer, and the superadmin's): the best equipment and
 * formation of each player per troop type – a tab of its own next to whatever else the reader may see.
 */
@Component({
  selector: 'app-evaluation-page',
  imports: [PageHeader, EvalSettingsTab, EvalResultsTab, EvalOverviewTab, EvalEquipmentTab],
  template: `
    @let x = texts();
    <app-page-header [crumbs]="crumbs()" [eyebrow]="x.eyebrow" [title]="x.title" [intro]="intro()" />

    <div class="container content is-evaluation">
      @if (!auth.ready()) {
        <div class="placeholder" aria-hidden="true"></div>
      } @else if (!allowed()) {
        <p class="state">{{ x.onlySuperuser }}</p>
      } @else {
        @if (tabs().length > 1) {
          <div class="segmented ev-tabs" role="group" [attr.aria-label]="x.title">
            @for (t of tabs(); track t) {
              <button type="button" [attr.aria-pressed]="tab() === t" (click)="showTab(t)">
                {{ x.tabs[t] }}@if (t === 'settings' && dirty()) {<span class="ev-dot" aria-hidden="true"></span>}
              </button>
            }
          </div>
        }
        @if (tab() === 'equipment') {
          @if (equipment.error()) {
            <p class="state">{{ x.loadError }}</p>
          } @else if (equipment.hasValue()) {
            <app-eval-equipment
              [data]="equipment.value()"
              [armory]="armory.index()"
              [armoryFailed]="armory.failed()"
              [texts]="x"
              [focus]="focus()"
            />
          } @else {
            <div class="placeholder" aria-hidden="true"></div>
          }
        } @else if (tab() === 'overview') {
          @if (overview.error()) {
            <p class="state">{{ x.loadError }}</p>
          } @else if (overview.hasValue()) {
            <app-eval-overview [overview]="overview.value()" [texts]="x" [focus]="focus()" />
          } @else {
            <div class="placeholder" aria-hidden="true"></div>
          }
        } @else if (data.error()) {
          <p class="state">{{ x.loadError }}</p>
        } @else if (data.hasValue()) {
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
              [filter]="filterQuery()"
              [focus]="focus()"
              (record)="saveRecord($event.id, $event.change)"
              (records)="saveRecords($event)"
              [publishedAt]="published().published_at"
              [changes]="changes()"
              [publishing]="publishing()"
              [publishFailed]="publishFailed()"
              (publish)="publish()"
            />
          }
        } @else {
          <div class="placeholder" aria-hidden="true"></div>
        }
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
   * estimate with the variables (all three tabs), or only the published required acclaim */
  protected readonly canEdit = computed(() => this.superuser() || !!this.auth.user()?.evaluation_settings);
  private readonly canOverview = computed(() => this.canEdit() || !!this.auth.user()?.evaluation_overview);
  /** R4 (Gether 19. 10. 2026): "Top 5 equip" */
  private readonly canEquipment = computed(() => this.superuser() || !!this.auth.user()?.reviewer);
  protected readonly allowed = computed(() => this.canOverview() || this.canEquipment());
  /** the tabs the reader may open, in the order of the buttons */
  protected readonly tabs = computed(() =>
    TABS.filter((t) => (t === 'overview' ? this.canOverview() : t === 'equipment' ? this.canEquipment() : this.canEdit())),
  );
  protected readonly data = this.api.data(() => this.canEdit());
  private readonly commanders = httpResource<MarchCommander[]>(() => (this.canEdit() ? marchCommandersUrl : undefined));
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
  /** ?tab=premenne opens the variables, ?tab=prehlad the published overview, so a reload or a shared link shows
   * them; no query = the table */
  readonly query = input<string>(undefined, { alias: 'tab' });
  /** ?f= – a quick filter of the table (read by the table only; the tabs keep it) */
  readonly filterQuery = input<string>(undefined, { alias: 'f' });
  /** ?hrac=12 – that player's row (only among the players this page's API gives the visitor) */
  readonly playerQuery = input<string>(undefined, { alias: 'hrac' });
  protected readonly focus = computed(() => {
    const id = Number(this.playerQuery());
    return Number.isInteger(id) && id > 0 ? id : null;
  });
  /** the tab in the address; an unknown value or a tab the reader may not open = the table, else the first one allowed */
  protected readonly tab = computed<Tab>(() => {
    const tabs = this.tabs();
    const query = this.query();
    const asked = TABS.find((t) => QUERY[t] !== null && QUERY[t] === query);
    if (asked && tabs.includes(asked)) return asked;
    return tabs.includes('results') ? 'results' : (tabs[0] ?? 'overview');
  });
  /** the overview as the players see it – loaded each time its tab opens */
  protected readonly overview = this.api.overview(() => this.canOverview() && this.tab() === 'overview');
  /** "Top 5 equip" – loaded each time its tab opens */
  protected readonly equipment = this.api.equipment(() => this.canEquipment() && this.tab() === 'equipment');
  protected readonly intro = computed(() => {
    const x = this.texts();
    if (this.canEdit() || !this.allowed()) return x.intro;
    return this.tab() === 'equipment' ? x.introEquipment : x.introOverview;
  });

  /** "Rátať s power": off = the estimate from the marches only (a view switch, not saved) */
  protected readonly usePower = signal(true);
  protected readonly evaluation = computed(() => evaluate(this.draft(), this.players(), this.armory.index(), this.usePower()));

  /** what is published now and how many players would see another value after publishing again */
  protected readonly published = linkedSignal<Overview>(() =>
    this.data.hasValue() ? this.data.value().overview : { published_at: null, rows: [] },
  );
  protected readonly changes = computed(() => overviewChanges(this.published().rows, overviewRows(this.evaluation())));
  protected readonly publishing = signal(false);
  protected readonly publishFailed = signal(false);

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

    const injector = inject(Injector);
    // a link with ?hrac= scrolls to the player's row once, as soon as the tab shows its data – one render after it, no
    // timers; back/forward is left to App, which puts the page where the visitor left it
    const back = this.router.currentNavigation()?.trigger === 'popstate';
    const scroller = inject(ViewportScroller);
    let scroll: boolean | undefined;
    effect(() => {
      // decided with the address the page was opened with
      scroll ??= !back && this.focus() !== null;
      const id = this.focus();
      if (!scroll || id === null) return;
      const tab = this.tab();
      const ready =
        tab === 'overview'
          ? this.overview.hasValue()
          : tab === 'equipment'
            ? this.equipment.hasValue() && !!this.armory.index()
            : tab === 'results' && this.data.hasValue();
      if (!ready) return;
      scroll = false;
      afterNextRender({ read: () => scroller.scrollToAnchor(`ev-player-${id}`) }, { injector });
    });

    // closing or reloading the tab with unsaved variables: the browser asks in its own words (no text of ours); only
    // while dirty, a clean page leaves at once (and stays in the back/forward cache)
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
    const queryParams = { tab: QUERY[tab] };
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

  /** "Zverejniť": the required acclaim as the table counts it now (not with unsaved variables – the button waits) */
  protected async publish(): Promise<void> {
    if (this.dirty()) return;
    this.publishing.set(true);
    this.publishFailed.set(false);
    try {
      this.published.set(await this.api.publish(overviewRows(this.evaluation())));
    } catch {
      this.publishFailed.set(true);
    } finally {
      this.publishing.set(false);
    }
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
          return s ? { ...p, power: s.power ?? null, t4: !!s.t4, power_bonus: s.power_bonus ?? 0 } : p;
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
      put({ power: saved.power, t4: saved.t4, power_bonus: saved.power_bonus });
    } catch {
      if (before) put({ power: before.power, t4: before.t4, power_bonus: before.power_bonus });
      this.recordFailed.set(true);
    }
  }
}

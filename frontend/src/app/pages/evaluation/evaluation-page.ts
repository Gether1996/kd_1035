import { httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
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
import { EvalSettings, normalizeSettings } from './settings';
import { EvalSettingsTab } from './settings-tab';
import { EVAL_TEXTS } from './texts';

type Tab = 'settings' | 'results';

/**
 * /vyhodnocovanie – the KvK evaluation of the superadmin (Gether 13. 10. 2026: the spreadsheet "KVK Requirements" on
 * the web, better). "Premenné" edits the variables, "Odhad acclaimu" shows what each player should reach from the
 * marches they clicked together; a changed variable counts in the table at once, "Uložiť" keeps it. Power is optional
 * (not asked from the players yet): when the superadmin writes it down, the marches it asks for and the excess count.
 * In the account menu of the superadmin and the players the superadmin lets in (Player.evaluator – they see approved
 * players only); a prerendered shell, not indexed, not in the sitemap.
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
        <div class="segmented ev-tabs" role="group" [attr.aria-label]="x.title">
          <button type="button" [attr.aria-pressed]="tab() === 'settings'" (click)="tab.set('settings')">
            {{ x.tabs.settings }}@if (dirty()) {<span class="ev-dot" aria-hidden="true"></span>}
          </button>
          <button type="button" [attr.aria-pressed]="tab() === 'results'" (click)="tab.set('results')">{{ x.tabs.results }}</button>
        </div>
        @if (armory.failed()) {
          <p class="notice notice--error">{{ x.armoryError }}</p>
        }
        @if (tab() === 'settings') {
          <app-eval-settings
            [(settings)]="draft"
            [evaluation]="evaluation()"
            [players]="players()"
            [commanders]="commanderNames()"
            [texts]="x"
          />
          <div class="ev-actions" role="group" [attr.aria-label]="x.tabs.settings">
            <p class="ev-actions__state" role="status">
              @if (failed()) {
                <span class="is-error">{{ x.settingsFailed }}</span>
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
  protected readonly texts = computed(() => EVAL_TEXTS[this.i18n.lang()]);

  protected readonly superuser = computed(() => !!this.auth.user()?.is_superuser);
  /** the superadmin and the players let in with the switch in Hráči on /ucet (Gether 13. 10. 2026) */
  protected readonly allowed = computed(() => this.superuser() || !!this.auth.user()?.evaluator);
  protected readonly data = this.api.data(() => this.allowed());
  private readonly commanders = httpResource<MarchCommander[]>(() => (this.allowed() ? marchCommandersUrl : undefined));
  protected readonly commanderNames = computed(() => (this.commanders.hasValue() ? this.commanders.value().map((c) => c.name) : []));

  /** the players as loaded, with the notes the superadmin changed since */
  protected readonly players = linkedSignal<EvalPlayer[]>(() => (this.data.hasValue() ? this.data.value().players : []));
  /** the variables as saved on the server (normalised into the defaults) */
  private readonly saved = linkedSignal<EvalSettings>(() => normalizeSettings(this.data.hasValue() ? this.data.value().settings : null));
  private readonly savedIso = linkedSignal(() => (this.data.hasValue() ? this.data.value().updated_at : null));
  /** the variables being edited – the table counts with them right away */
  protected readonly draft = linkedSignal(() => this.saved());
  protected readonly dirty = computed(() => JSON.stringify(this.draft()) !== JSON.stringify(this.saved()));
  protected readonly saving = signal(false);
  protected readonly failed = signal(false);
  protected readonly recordFailed = signal(false);
  protected readonly tab = signal<Tab>('results');

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
  }

  protected async save(): Promise<void> {
    this.saving.set(true);
    this.failed.set(false);
    try {
      const res = await this.api.saveSettings(this.draft());
      this.saved.set(normalizeSettings(res.settings));
      this.savedIso.set(res.updated_at);
      this.draft.set(this.saved());
    } catch {
      this.failed.set(true);
    } finally {
      this.saving.set(false);
    }
  }

  protected discard(): void {
    this.draft.set(this.saved());
    this.failed.set(false);
  }

  /** the spreadsheet's values – saved only with "Uložiť" */
  protected defaults(): void {
    this.draft.set(normalizeSettings(null));
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

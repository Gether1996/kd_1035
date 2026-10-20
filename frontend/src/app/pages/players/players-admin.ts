import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal, untracked } from '@angular/core';
import { I18n } from '../../core/i18n/i18n';
import { KINGDOM_ZONE } from '../../core/kingdom-zone';
import { KvkApi, PlayerFlag, ReviewerRow } from '../../core/kvk-api';
import { fold } from '../../shared/search';
import { MarchNotices } from '../../shared/march-notices';
import { Icon } from '../../shared/icon';
import { EvalTip } from '../evaluation/tip';

type AccessFilter = 'all' | 'r4' | 'evaluation_settings' | 'evaluation_overview' | 'none';
type ApprovalFilter = 'all' | 'approved' | 'pending';
type Sort = 'name' | 'newest' | 'login' | 'marches';
type MarchFilter = 'all' | 'with' | 'without' | 'fix';
type KvkFilter = 'all' | 'any' | 'rally' | 'garrison' | 'none';

/**
 * "Hráči" on /hraci – superuser only (Gether 11. and 12. 10. 2026; a page of its own since 20. 10. 2026, before a section
 * of /ucet): every active player – with Discord or with an in-game name and a password (17. 10. 2026) – with five
 * switches: "Schválený" (a new player adds marches and KvK sign-ups only once approved; the superadmin gets a Discord
 * message about each new one), "R4" (sees every KvK sign-up and every player's marches), "Vyh. nastavenia" and
 * "Pož. acclaim" (/vyhodnocovanie – its estimate and variables, or only the published overview; Gether 14. 10. 2026)
 * and "Neaktívny"; a legend above the list explains them with an "i" each. Sorting and filters for marches and KvK
 * sign-ups like on /marche; the players waiting for the approval come first. "Prístup" filters by the switches;
 * "Na opravu" and the red count in a row are the player's marches with a wrong pair or formation, red on /marche too
 * (Gether 14. 10. 2026). "Schvaľovať automaticky" lets every new player in at once, without the Discord message.
 * "Neaktívny" (Gether 20. 10. 2026: "zneviditeľním určitých hráčov v zozname") hides a player from this list until
 * "Zobraziť neaktívnych" is on (off by default) – nothing else changes for them: they stay in the KvK sign-ups, on
 * /marche and in "Top 5 equip".
 */
@Component({
  selector: 'app-players-admin',
  imports: [EvalTip, MarchNotices, Icon],
  template: `
    @let k = t();
    <section class="panel" aria-labelledby="players-title">
      <h2 class="panel__title panel__title--small" id="players-title">
        {{ k.title }} <span class="count">{{ activeCount() }}</span>
      </h2>
      @if (data.hasValue()) {
        <label class="auto-approve">
          <span class="auto-approve__text">
            <strong id="auto-approve-label">{{ k.auto }}</strong>
            <span id="auto-approve-hint">{{ autoApprove() ? k.autoOn : k.autoOff }}</span>
          </span>
          <input
            #auto
            class="switch"
            type="checkbox"
            role="switch"
            aria-labelledby="auto-approve-label"
            aria-describedby="auto-approve-hint"
            [checked]="autoApprove()"
            (change)="setAuto(auto)"
          />
        </label>
        <!-- a Discord DM to the players with a wrong pair or formation (Gether 14. 10. 2026) -->
        <div class="players-notices"><app-march-notices /></div>
      }
      <div class="players-bar">
        <div class="field reviewers__search">
          <label class="sr-only" for="players-search">{{ k.search }}</label>
          <input
            #q
            id="players-search"
            class="input"
            type="search"
            autocomplete="off"
            [placeholder]="k.search"
            [value]="search()"
            (input)="search.set(q.value)"
          />
        </div>
        <div class="list__filters">
          <div class="segmented" role="group" [attr.aria-label]="k.filters.approval">
            @for (f of approvalFilters; track f) {
              <button type="button" [attr.aria-pressed]="approval() === f" (click)="approval.set(f)">
                {{ f === 'all' ? k.filters.all : k.filters[f] }} · {{ approvalCount(f) }}
              </button>
            }
          </div>
          <!-- the players hidden with "Neaktívny" (off by default) -->
          <label class="reviewer__switch show-inactive">
            <span>{{ k.showInactive }} · {{ inactiveCount() }}</span>
            <input #showAll class="switch" type="checkbox" role="switch" [checked]="showInactive()" (change)="showInactive.set(showAll.checked)" />
          </label>
        </div>
        <div class="players-bar__selects">
          <div class="field players-bar__select">
            <label class="sr-only" for="players-access">{{ k.access }}</label>
            <select #accessBy id="players-access" class="select" (change)="access.set($any(accessBy.value))">
              @for (o of accessFilters; track o) {
                <option [value]="o" [selected]="access() === o">{{ k.accessFilters[o] }} · {{ accessCount(o) }}</option>
              }
            </select>
          </div>
          <div class="field players-bar__select">
            <label class="sr-only" for="players-sort">{{ k.sort }}</label>
            <select #sortBy id="players-sort" class="select" (change)="sort.set($any(sortBy.value))">
              @for (o of sorts; track o) {
                <option [value]="o" [selected]="sort() === o">{{ k.sorts[o] }}</option>
              }
            </select>
          </div>
          <div class="field players-bar__select">
            <label class="sr-only" for="players-marches">{{ k.marchFilter }}</label>
            <select #marchBy id="players-marches" class="select" (change)="marchFilter.set($any(marchBy.value))">
              @for (o of marchFilters; track o) {
                <option [value]="o" [selected]="marchFilter() === o">{{ k.marchFilters[o] }}</option>
              }
            </select>
          </div>
          <div class="field players-bar__select">
            <label class="sr-only" for="players-kvk">{{ k.kvkFilter }}</label>
            <select #kvkBy id="players-kvk" class="select" (change)="kvkFilter.set($any(kvkBy.value))">
              @for (o of kvkFilters; track o) {
                <option [value]="o" [selected]="kvkFilter() === o">{{ k.kvkFilters[o] }}</option>
              }
            </select>
          </div>
        </div>
      </div>
      @if (data.error()) {
        <p class="panel__lead is-error">{{ k.loadError }}</p>
      }
      <!-- what the switches of each row do, once for the whole list -->
      <ul class="switch-legend" [attr.aria-label]="k.legend">
        @for (f of flags; track f) {
          <li>
            {{ k.flags[f].short }}
            <app-eval-tip [text]="k.flags[f].tip" [label]="k.flags[f].label" />
          </li>
        }
      </ul>
      <ul class="reviewers">
        @for (p of shown(); track p.id) {
          <li class="reviewer" [class.is-pending]="!p.approved && !p.superuser" [class.is-inactive]="p.inactive">
            <img class="signup__avatar" [src]="p.avatar_url" alt="" width="36" height="36" />
            <span class="reviewer__name">
              <strong>
                {{ p.ingame_name || p.name }}
                @if (!p.approved && !p.superuser) {
                  <span class="tag tag--pending">{{ k.pending }}</span>
                }
                @if (p.local) {
                  <span class="tag">{{ k.local.tag }}</span>
                }
                @if (p.inactive) {
                  <span class="tag">{{ k.inactiveTag }}</span>
                }
              </strong>
              <span>
                <!-- "· na opravu: 2" red: the marches red on /marche, a wrong pair or formation for the KvK evaluation -->
                {{ p.ingame_name && !p.local ? p.name + ' · ' : '' }}{{ p.superuser ? k.superuser + ' · ' : '' }}{{ details(p) }}@if (p.issues) { · <span class="reviewer__issues" [title]="k.issuesHint">{{ k.issues.replace('{n}', '' + p.issues) }}<span class="sr-only"> – {{ k.issuesHint }}</span></span>}
              </span>
            </span>
            @if (!p.superuser) {
              <span class="reviewer__switches">
                @for (f of flags; track f) {
                  <label class="reviewer__switch">
                    <span aria-hidden="true">{{ k.flags[f].short }}</span>
                    <input
                      #box
                      class="switch"
                      type="checkbox"
                      role="switch"
                      [attr.aria-label]="k.flags[f].label + ': ' + (p.ingame_name || p.name)"
                      [attr.aria-describedby]="f !== 'approved' && f !== 'inactive' && cutOff(p) ? 'inactive-' + p.id : null"
                      [checked]="p[f]"
                      (change)="set(p, f, box)"
                    />
                  </label>
                }
              </span>
              @if (cutOff(p)) {
                <!-- the switches stay stored: a new approval gives the access back with no other click -->
                <p class="reviewer__inactive" [id]="'inactive-' + p.id">{{ k.flagsInactive }}</p>
              }
            }
            @if (p.local) {
              <!-- without Discord (Gether 17. 10. 2026): a code for a new password; a waiting one can be deleted -->
              <div class="reviewer__local">
                <button type="button" class="pill-btn pill-btn--quiet" [disabled]="busy()" (click)="code(p)">
                  <svg appIcon="key-round"></svg>{{ k.local.code }}
                </button>
                @if (!p.approved) {
                  <button
                    type="button"
                    class="danger"
                    [class.is-armed]="deleting() === p.id"
                    [disabled]="busy()"
                    [attr.aria-label]="(deleting() === p.id ? k.local.confirm : k.local.delete) + ': ' + p.ingame_name"
                    (click)="remove(p)"
                  >
                    <svg appIcon="trash-2"></svg>{{ deleting() === p.id ? k.local.confirm : k.local.delete }}
                  </button>
                }
                @if (codes()[p.id]; as c) {
                  <p class="reviewer__code" role="status">
                    {{ k.local.codeIs }} <strong>{{ c.code }}</strong> · {{ k.local.until.replace('{date}', c.until) }}
                  </p>
                }
              </div>
            }
          </li>
        } @empty {
          @if (data.hasValue()) {
            <li class="panel__lead">{{ players().length ? k.noMatch : k.empty }}</li>
          }
        }
      </ul>
      <p class="form__state is-error" role="status">{{ failed() ? k.failed : '' }}</p>
    </section>
  `,
  styleUrl: '../kvk/kvk.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlayersAdmin {
  private readonly api = inject(KvkApi);
  protected readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.t().players);
  protected readonly accessFilters: AccessFilter[] = ['all', 'r4', 'evaluation_settings', 'evaluation_overview', 'none'];
  protected readonly approvalFilters: ApprovalFilter[] = ['all', 'pending', 'approved'];
  protected readonly sorts: Sort[] = ['name', 'newest', 'login', 'marches'];
  protected readonly marchFilters: MarchFilter[] = ['all', 'with', 'without', 'fix'];
  protected readonly kvkFilters: KvkFilter[] = ['all', 'any', 'rally', 'garrison', 'none'];
  protected readonly flags: PlayerFlag[] = ['approved', 'reviewer', 'evaluation_settings', 'evaluation_overview', 'inactive'];

  protected readonly data = this.api.reviewers(() => true);
  protected readonly players = linkedSignal<ReviewerRow[]>(() => (this.data.hasValue() ? this.data.value().players : []));
  /** new players approved at once, no Discord message (Gether 12. 10. 2026: open for now, closed later) */
  protected readonly autoApprove = linkedSignal(() => this.data.hasValue() && this.data.value().auto_approve);
  protected readonly search = signal('');
  protected readonly access = signal<AccessFilter>('all');
  protected readonly approval = signal<ApprovalFilter>('all');
  protected readonly sort = signal<Sort>('name');
  protected readonly marchFilter = signal<MarchFilter>('all');
  protected readonly kvkFilter = signal<KvkFilter>('all');
  /** the players marked "Neaktívny" are left out unless this is on */
  protected readonly showInactive = signal(false);
  protected readonly failed = signal(false);
  protected readonly busy = signal(false);
  /** a player without Discord waiting for the approval: the first click on "Zmazať" asks, the second deletes */
  protected readonly deleting = signal<number | null>(null);
  /** the codes for a new password created now – shown once, the server keeps only their hash */
  protected readonly codes = signal<Record<number, { code: string; until: string }>>({});

  /** the superadmin counts as approved; with no switches of their own, they are in no access filter but "všetci" */
  private readonly approved = (p: ReviewerRow) => p.approved || p.superuser;
  /** R4 and the evaluation count only while approved (taking the approval back cuts them off) – said when one is on */
  protected readonly cutOff = (p: ReviewerRow) =>
    !this.approved(p) && (p.reviewer || p.evaluation_settings || p.evaluation_overview);
  private readonly accessMatches = (p: ReviewerRow, f: AccessFilter) =>
    f === 'all' ||
    (!p.superuser &&
      (f === 'r4' ? p.reviewer : f === 'none' ? !p.reviewer && !p.evaluation_settings && !p.evaluation_overview : p[f]));
  private readonly approvalMatches = (p: ReviewerRow, f: ApprovalFilter) =>
    f === 'all' || (f === 'approved') === this.approved(p);

  private readonly marchMatches = (p: ReviewerRow, f: MarchFilter) =>
    f === 'all' || (f === 'fix' ? p.issues > 0 : (f === 'with') === p.marches > 0);
  private readonly kvkMatches = (p: ReviewerRow, f: KvkFilter) =>
    f === 'all' || (f === 'any' ? p.kvk.length > 0 : f === 'none' ? !p.kvk.length : p.kvk.includes(f));

  protected readonly activeCount = computed(() => this.players().filter((p) => !p.inactive).length);
  protected readonly inactiveCount = computed(() => this.players().filter((p) => p.inactive).length);

  /**
   * The search, marches, KvK and "Neaktívny" – the counts of the approval filter follow the access one and the other way
   * round. A player switched to "Neaktívny" keeps the row (with its tag) until a filter changes, like the other switches.
   */
  private readonly found = computed(() => {
    const query = fold(this.search());
    const marches = this.marchFilter();
    const kvk = this.kvkFilter();
    const all = this.showInactive();
    const filtered = this.filtered();
    return this.players().filter(
      (p) =>
        (all || !(filtered.get(p.id) ?? p).inactive) &&
        (!query || fold(`${p.ingame_name} ${p.name}`).includes(query)) &&
        this.marchMatches(p, marches) &&
        this.kvkMatches(p, kvk),
    );
  });

  /**
   * The order as loaded: the players waiting for the approval first (the newest of them on top), the rest by the sort
   * picked – by name (the API's order), the newest, the last signed in or the most marches. A switch does not move its
   * row away under the cursor.
   */
  private readonly rank = computed(() => {
    const loaded = this.data.hasValue() ? this.data.value().players : [];
    const sort = this.sort();
    const by = (a: ReviewerRow, b: ReviewerRow) =>
      sort === 'newest'
        ? b.created_at.localeCompare(a.created_at)
        : sort === 'login'
          ? (b.last_login ?? '').localeCompare(a.last_login ?? '')
          : sort === 'marches'
            ? b.marches - a.marches
            : 0;
    const order = loaded
      .map((p, i) => ({ p, i }))
      .sort((a, b) => {
        const waiting = Number(this.approved(a.p)) - Number(this.approved(b.p));
        if (waiting) return waiting;
        // shown with "Zobraziť neaktívnych": at the end
        const inactive = Number(a.p.inactive) - Number(b.p.inactive);
        if (inactive) return inactive;
        if (!this.approved(a.p)) return b.p.created_at.localeCompare(a.p.created_at);
        return by(a.p, b.p) || a.i - b.i;
      });
    return new Map(order.map(({ p }, i) => [p.id, i]));
  });

  /**
   * The players as they were when a filter was picked (or the list loaded): a switch flipped under "Čakajú" or an
   * access filter keeps its row until the next filter change – the counts on the buttons follow at once.
   */
  private readonly filtered = linkedSignal({
    source: () => [this.access(), this.approval(), this.showInactive(), this.data.hasValue() ? this.data.value() : null] as const,
    computation: () => new Map(untracked(this.players).map((p) => [p.id, p])),
  });

  protected readonly shown = computed(() => {
    const rank = this.rank();
    const filtered = this.filtered();
    const as = (p: ReviewerRow) => filtered.get(p.id) ?? p;
    return this.found()
      .filter((p) => this.accessMatches(as(p), this.access()) && this.approvalMatches(as(p), this.approval()))
      .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  });

  protected accessCount(f: AccessFilter): number {
    return this.found().filter((p) => this.accessMatches(p, f) && this.approvalMatches(p, this.approval())).length;
  }

  protected approvalCount(f: ApprovalFilter): number {
    return this.found().filter((p) => this.approvalMatches(p, f) && this.accessMatches(p, this.access())).length;
  }

  /** "od 12. 10. 2026 14:32 · naposledy 13. 10. 2026 9:05 · 3 marche · KvK rally, garrison" – in the kingdom's time */
  protected details(p: ReviewerRow): string {
    const k = this.t();
    const date = new Intl.DateTimeFormat(this.i18n.locale(), {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: KINGDOM_ZONE,
    });
    const [one, few, many] = k.marchCount;
    const n = p.marches;
    const parts = [k.since.replace('{date}', date.format(new Date(p.created_at)))];
    if (p.last_login) parts.push(k.lastLogin.replace('{date}', date.format(new Date(p.last_login))));
    if (n) parts.push((n === 1 ? one : n <= 4 ? few : many).replace('{n}', String(n)));
    // rally before garrison, like the sign-ups
    if (p.kvk.length) parts.push(k.kvk.replace('{roles}', [...p.kvk].sort().reverse().join(', ')));
    return parts.join(' · ');
  }

  protected async setAuto(box: HTMLInputElement): Promise<void> {
    const value = box.checked;
    this.failed.set(false);
    try {
      this.autoApprove.set((await this.api.setAutoApprove(value)).auto_approve);
    } catch {
      this.failed.set(true);
      box.checked = !value; // the switch goes back
    }
  }

  protected async set(player: ReviewerRow, flag: PlayerFlag, box: HTMLInputElement): Promise<void> {
    const value = box.checked;
    this.failed.set(false);
    try {
      await this.api.setPlayer(player.id, { [flag]: value });
      this.players.update((list) => list.map((p) => (p.id === player.id ? { ...p, [flag]: value } : p)));
    } catch {
      this.failed.set(true);
      box.checked = !value; // the switch goes back
    }
  }

  protected async code(player: ReviewerRow): Promise<void> {
    await this.act(async () => {
      const { code, until } = await this.api.resetCode(player.id);
      const date = new Intl.DateTimeFormat(this.i18n.locale(), {
        day: 'numeric',
        month: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: KINGDOM_ZONE,
      }).format(new Date(until));
      this.codes.update((codes) => ({ ...codes, [player.id]: { code, until: date } }));
    });
  }

  protected async remove(player: ReviewerRow): Promise<void> {
    if (this.deleting() !== player.id) {
      this.deleting.set(player.id);
      return;
    }
    await this.act(async () => {
      await this.api.deleteLocal(player.id);
      this.players.update((list) => list.filter((p) => p.id !== player.id));
      this.deleting.set(null);
    });
  }

  private async act(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.failed.set(false);
    try {
      await action();
    } catch {
      this.failed.set(true);
    } finally {
      this.busy.set(false);
    }
  }
}

import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal, untracked } from '@angular/core';
import { I18n } from '../../core/i18n/i18n';
import { KvkApi, ReviewerRow } from '../../core/kvk-api';
import { fold } from '../../shared/search';

type Flag = 'reviewer' | 'approved';
type RoleFilter = 'all' | 'r4' | 'others';
type ApprovalFilter = 'all' | 'approved' | 'pending';

/**
 * "Hráči" on /ucet – superuser only (Gether 11. and 12. 10. 2026): every player signed in with Discord with two
 * switches – "Schválený" (a new player adds marches and KvK sign-ups only once approved; the superadmin gets a Discord
 * message about each new one) and "R4" (sees every KvK sign-up and every player's marches). Filters for R4 and the
 * approval; the players waiting for it come first.
 */
@Component({
  selector: 'app-players-admin',
  template: `
    @let k = t();
    <section class="panel" aria-labelledby="players-title">
      <h2 class="panel__title panel__title--small" id="players-title">
        {{ k.title }} <span class="count">{{ players().length }}</span>
      </h2>
      <p class="panel__lead">{{ k.lead }}</p>
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
          <div class="segmented" role="group" [attr.aria-label]="k.filters.role">
            @for (f of roleFilters; track f) {
              <button type="button" [attr.aria-pressed]="role() === f" (click)="role.set(f)">
                {{ k.filters[f] }} · {{ roleCount(f) }}
              </button>
            }
          </div>
        </div>
      </div>
      @if (data.error()) {
        <p class="panel__lead is-error">{{ k.loadError }}</p>
      }
      <ul class="reviewers">
        @for (p of shown(); track p.id) {
          <li class="reviewer" [class.is-pending]="!p.approved && !p.superuser">
            <img class="signup__avatar" [src]="p.avatar_url" alt="" width="36" height="36" />
            <span class="reviewer__name">
              <strong>
                {{ p.ingame_name || p.name }}
                @if (!p.approved && !p.superuser) {
                  <span class="tag tag--pending">{{ k.pending }}</span>
                }
              </strong>
              <span>
                {{ p.ingame_name ? p.name + ' · ' : '' }}{{ p.superuser ? k.superuser + ' · ' : '' }}{{ since(p.created_at) }}
              </span>
            </span>
            @if (!p.superuser) {
              <span class="reviewer__switches">
                <label class="reviewer__switch">
                  <span aria-hidden="true">{{ k.approve }}</span>
                  <input
                    #ok
                    class="switch"
                    type="checkbox"
                    role="switch"
                    [attr.aria-label]="k.approveLabel + ': ' + (p.ingame_name || p.name)"
                    [checked]="p.approved"
                    (change)="set(p, 'approved', ok)"
                  />
                </label>
                <label class="reviewer__switch">
                  <span aria-hidden="true">{{ k.r4 }}</span>
                  <input
                    #r4
                    class="switch"
                    type="checkbox"
                    role="switch"
                    [attr.aria-label]="k.toggle + ': ' + (p.ingame_name || p.name)"
                    [checked]="p.reviewer"
                    (change)="set(p, 'reviewer', r4)"
                  />
                </label>
              </span>
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
  protected readonly roleFilters: RoleFilter[] = ['all', 'r4', 'others'];
  protected readonly approvalFilters: ApprovalFilter[] = ['all', 'pending', 'approved'];

  protected readonly data = this.api.reviewers(() => true);
  protected readonly players = linkedSignal<ReviewerRow[]>(() => (this.data.hasValue() ? this.data.value().players : []));
  protected readonly search = signal('');
  protected readonly role = signal<RoleFilter>('all');
  protected readonly approval = signal<ApprovalFilter>('all');
  protected readonly failed = signal(false);

  /** the superadmin counts as approved and not as R4 */
  private readonly approved = (p: ReviewerRow) => p.approved || p.superuser;
  private readonly roleMatches = (p: ReviewerRow, f: RoleFilter) =>
    f === 'all' || (f === 'r4') === (p.reviewer && !p.superuser);
  private readonly approvalMatches = (p: ReviewerRow, f: ApprovalFilter) =>
    f === 'all' || (f === 'approved') === this.approved(p);

  /** the search and the other filter – the counts on the buttons of one filter follow the other one */
  private readonly found = computed(() => {
    const query = fold(this.search());
    return this.players().filter((p) => !query || fold(`${p.ingame_name} ${p.name}`).includes(query));
  });

  /**
   * The order as loaded: the players waiting for the approval first, the newest of them on top, the rest by name (the
   * API's order). A switch does not move its row away under the cursor.
   */
  private readonly rank = computed(() => {
    const loaded = this.data.hasValue() ? this.data.value().players : [];
    const order = loaded
      .map((p, i) => ({ p, i }))
      .sort((a, b) => {
        const waiting = Number(this.approved(a.p)) - Number(this.approved(b.p));
        if (waiting) return waiting;
        return this.approved(a.p) ? a.i - b.i : b.p.created_at.localeCompare(a.p.created_at);
      });
    return new Map(order.map(({ p }, i) => [p.id, i]));
  });

  /**
   * The players as they were when a filter was picked (or the list loaded): a switch flipped under "Čakajú" or "R4"
   * keeps its row until the next filter change – the counts on the buttons follow at once.
   */
  private readonly filtered = linkedSignal({
    source: () => [this.role(), this.approval(), this.data.hasValue() ? this.data.value() : null] as const,
    computation: () => new Map(untracked(this.players).map((p) => [p.id, p])),
  });

  protected readonly shown = computed(() => {
    const rank = this.rank();
    const filtered = this.filtered();
    const as = (p: ReviewerRow) => filtered.get(p.id) ?? p;
    return this.found()
      .filter((p) => this.roleMatches(as(p), this.role()) && this.approvalMatches(as(p), this.approval()))
      .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  });

  protected roleCount(f: RoleFilter): number {
    return this.found().filter((p) => this.roleMatches(p, f) && this.approvalMatches(p, this.approval())).length;
  }

  protected approvalCount(f: ApprovalFilter): number {
    return this.found().filter((p) => this.approvalMatches(p, f) && this.roleMatches(p, this.role())).length;
  }

  /** "od 12. 10. 2026" – the first sign-in */
  protected since(iso: string): string {
    const date = new Intl.DateTimeFormat(this.i18n.locale(), { day: 'numeric', month: 'numeric', year: 'numeric' });
    return this.t().since.replace('{date}', date.format(new Date(iso)));
  }

  protected async set(player: ReviewerRow, flag: Flag, box: HTMLInputElement): Promise<void> {
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
}

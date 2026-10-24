import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Auth } from '../../core/auth';
import { I18n } from '../../core/i18n/i18n';
import { KINGDOM_ZONE } from '../../core/kingdom-zone';
import { Icon } from '../../shared/icon';
import { EVAL_TEXTS } from './texts';

export type HistoryKind = 'settings' | 'players';

/** one save, as GET /api/evaluation/changes/ sends it */
export interface EvalChange {
  id: number;
  at: string;
  /** '' = the account is gone */
  author: string;
  kind: 'settings' | 'pairs' | 'formations' | 'player' | 'publish';
  player: { id: number; name: string } | null;
  /** [what, before, after] */
  changes: [string, unknown, unknown][];
  /** lines left out of a very large save */
  more: number;
}

/**
 * "História zmien" at the end of Premenné and Odhad acclaimu (Gether 24. 10. 2026: "aby som videl, čo kto kedy zmení
 * … či niečo zmenil kolega"; "históriu len pre mňa, superadmina"): who saved what and when, the newest first. Loaded
 * when opened and again with "Obnoviť"; nothing at all for anyone but the superadmin.
 */
@Component({
  selector: 'app-eval-history',
  imports: [Icon],
  template: `
    @if (auth.user()?.is_superuser) {
      @let h = x().history;
      <details class="ev-history" (toggle)="toggled($event)">
        <summary class="ev-history__summary">
          <svg appIcon="clock"></svg>
          <span>{{ h.title }}</span>
          <svg class="ev-history__chevron" appIcon="chevron-down"></svg>
        </summary>
        <div class="ev-history__body">
          <p class="ev-history__hint">
            {{ h.hint }}
            <button type="button" class="pill-btn pill-btn--quiet ev-history__refresh" [disabled]="loading()" (click)="load()">
              <svg appIcon="repeat"></svg>{{ h.refresh }}
            </button>
          </p>
          @if (failed()) {
            <p class="ev-history__state is-error" role="alert">{{ h.failed }}</p>
          } @else if (loading() && !changes()) {
            <p class="ev-history__state">{{ h.loading }}</p>
          } @else if (changes(); as list) {
            @if (!list.length) {
              <p class="ev-history__state">{{ h.empty }}</p>
            }
            <ol class="ev-history__list">
              @for (c of list; track c.id) {
                <li class="ev-history__entry">
                  <p class="ev-history__head">
                    <time [attr.datetime]="c.at">{{ when(c.at) }}</time>
                    · <strong>{{ c.author || h.deleted }}</strong>
                    · {{ h.kinds[c.kind] }}@if (c.player) {: {{ c.player.name }}}
                  </p>
                  <ul class="ev-history__lines">
                    @for (line of c.changes; track $index) {
                      <li>
                        <span class="ev-history__what">{{ label(c, line[0]) }}</span>
                        {{ value(line[1]) }} → <strong>{{ value(line[2]) }}</strong>
                      </li>
                    }
                    @if (c.more) {
                      <li class="ev-history__more">{{ h.more.replace('{n}', '' + c.more) }}</li>
                    }
                  </ul>
                </li>
              }
            </ol>
          }
        </div>
      </details>
    }
  `,
  styleUrl: './history.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EvalHistory {
  readonly kind = input.required<HistoryKind>();

  protected readonly auth = inject(Auth);
  private readonly i18n = inject(I18n);
  private readonly http = inject(HttpClient);
  protected readonly x = computed(() => EVAL_TEXTS[this.i18n.lang()]);
  protected readonly changes = signal<EvalChange[] | null>(null);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);

  protected toggled(event: Event): void {
    if ((event.target as HTMLDetailsElement).open) void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.failed.set(false);
    try {
      const res = await firstValueFrom(
        this.http.get<{ changes: EvalChange[] }>('/api/evaluation/changes/', { params: { kind: this.kind() } }),
      );
      this.changes.set(res.changes);
    } catch {
      this.failed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected when(iso: string): string {
    return new Intl.DateTimeFormat(this.i18n.locale(), {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: KINGDOM_ZONE,
    }).format(new Date(iso));
  }

  /** the name of a variable from the page's own labels where it has one, else the path as it is */
  protected label(change: EvalChange, what: string): string {
    const h = this.x().history;
    if (change.kind === 'player') return (h.fields as Record<string, string>)[what] ?? what;
    if (change.kind === 'publish') return h.rows;
    if (change.kind !== 'settings') return what;
    const sections = this.x().sections as unknown as Record<string, Record<string, unknown>>;
    const [group, key, ...rest] = what.split('.');
    const section = sections[group];
    // the power table: "Odporúčaná power podľa počtu marchov 3 · Power od (M)"
    if (group === 'power' && key === 'table' && rest.length === 2 && section) {
      const column = section[rest[1]];
      return `${section['table']} ${Number(rest[0]) + 1} · ${typeof column === 'string' ? column : rest[1]}`;
    }
    const named = section?.[key];
    if (typeof named === 'string' && !rest.length) return named;
    if (named && typeof named === 'object' && rest.length === 1) {
      const inner = (named as Record<string, unknown>)[rest[0]];
      if (typeof inner === 'string') return inner;
    }
    return what;
  }

  protected value(v: unknown): string {
    const h = this.x().history;
    if (v === null || v === undefined) return '–';
    if (typeof v === 'boolean') return v ? h.yes : h.no;
    if (typeof v === 'number') return new Intl.NumberFormat(this.i18n.locale(), { maximumFractionDigits: 3 }).format(v);
    const text = typeof v === 'string' ? v : JSON.stringify(v);
    return text.length > 80 ? text.slice(0, 77) + '…' : text;
  }
}

import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n } from '../../core/i18n/i18n';
import { KINGDOM_ZONE } from '../../core/kingdom-zone';
import { fold } from '../../shared/search';
import { Overview, OverviewPlayer } from './overview';
import { EvalTexts } from './texts';

/**
 * "Požadovaný acclaim" of /vyhodnocovanie (Gether 14. 10. 2026: "čisto výsledná tabuľka na prehľad pre hráčov, nič
 * editovateľné"): what an evaluator published – each approved player's required acclaim and counted marches, the
 * reader's own on top. The players with the overview switch see only this tab; the evaluators see it as the players do.
 */
@Component({
  selector: 'app-eval-overview',
  imports: [RouterLink],
  template: `
    @let x = texts().overview;
    @let o = overview();
    @if (!o.published_at) {
      <p class="state">{{ x.none }}</p>
    } @else {
      @if (mine(); as m) {
        <div class="ov-mine">
          <span class="ov-mine__label">{{ x.yours }}</span>
          <strong class="ov-mine__value">{{ int(m.required) }}</strong>
          <span class="ov-mine__marches">
            {{ x.marches }}: {{ m.marches }}@if (m.missing) {<span class="ov-missing" [title]="x.missingTitle"> +{{ m.missing }}</span>}
          </span>
        </div>
      }
      <div class="ov-bar">
        <p class="ov-note">{{ x.published.replace('{date}', date(o.published_at)) }} {{ x.hint }}</p>
        <a class="pill-btn pill-btn--quiet ov-link" [routerLink]="i18n.path('playersMarches')" [queryParams]="{ tab: 'prehlad' }">{{ x.marchesLink }}</a>
      </div>
      <div class="field ov-search">
        <label class="sr-only" for="ov-search">{{ x.search }}</label>
        <input
          #q
          id="ov-search"
          class="input"
          type="search"
          autocomplete="off"
          [placeholder]="x.search"
          [value]="search()"
          (input)="search.set(q.value)"
        />
      </div>
      <table class="ev-table ov-table">
        <thead>
          <tr>
            <th scope="col" class="ev-num">#</th>
            <th scope="col">{{ x.player }}</th>
            <th scope="col" class="ev-num">{{ x.marches }}</th>
            <th scope="col" class="ev-num ov-required">{{ x.required }}</th>
          </tr>
        </thead>
        <tbody>
          @for (r of rows(); track r.row.id) {
            <tr [class.is-you]="r.row.you">
              <td class="ev-num ov-rank">{{ r.rank }}</td>
              <th scope="row" class="ov-player">
                <span class="ov-player__box">
                  <img class="ov-avatar" [src]="r.row.avatar_url" alt="" width="28" height="28" loading="lazy" />
                  <span class="ov-name">{{ r.row.name }}</span>
                  @if (r.row.you) {
                    <span class="ov-you">{{ x.you }}</span>
                  }
                </span>
              </th>
              <td class="ev-num">
                {{ r.row.marches }}@if (r.row.missing) {<span class="ov-missing" [title]="x.missingTitle"> +{{ r.row.missing }}</span>}
              </td>
              <td class="ev-num ov-required">{{ int(r.row.required) }}</td>
            </tr>
          } @empty {
            <tr>
              <td colspan="4" class="ov-empty">{{ x.empty }}</td>
            </tr>
          }
        </tbody>
      </table>
    }
  `,
  styleUrl: './overview-tab.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EvalOverviewTab {
  readonly overview = input.required<Overview<OverviewPlayer>>();
  readonly texts = input.required<EvalTexts>();

  protected readonly i18n = inject(I18n);
  protected readonly search = signal('');

  /** the highest first; the rank stays while searching */
  private readonly ranked = computed(() =>
    [...this.overview().rows]
      .sort((a, b) => b.required - a.required || a.name.localeCompare(b.name))
      .map((row, i) => ({ row, rank: i + 1 })),
  );
  protected readonly rows = computed(() => {
    const query = fold(this.search());
    return query ? this.ranked().filter((r) => fold(r.row.name).includes(query)) : this.ranked();
  });
  protected readonly mine = computed(() => this.overview().rows.find((r) => r.you) ?? null);

  protected int(n: number): string {
    return new Intl.NumberFormat(this.i18n.locale(), { maximumFractionDigits: 0 }).format(n);
  }

  protected date(iso: string): string {
    return new Intl.DateTimeFormat(this.i18n.locale(), {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: KINGDOM_ZONE,
    }).format(new Date(iso));
  }
}

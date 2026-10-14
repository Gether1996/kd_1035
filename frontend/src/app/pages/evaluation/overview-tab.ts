import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Auth } from '../../core/auth';
import { I18n } from '../../core/i18n/i18n';
import { KINGDOM_ZONE } from '../../core/kingdom-zone';
import { Icon } from '../../shared/icon';
import { fold } from '../../shared/search';
import { Overview, OverviewPlayer, overOwn } from './overview';
import { EvalTexts } from './texts';

type SortKey = 'name' | 'marches' | 'power' | 'required';

/**
 * "Požadovaný acclaim" of /vyhodnocovanie (Gether 14. 10. 2026: "čisto výsledná tabuľka na prehľad pre hráčov, nič
 * editovateľné"): what an evaluator published – each approved player's counted marches (+ the ones the power asks
 * for), the power with the power the marches carry, and the required acclaim; the reader's own on top. A click on a
 * column header sorts by it (again = the other way). The players with the overview switch see only this tab; the
 * evaluators see it as the players do.
 */
@Component({
  selector: 'app-eval-overview',
  imports: [RouterLink, Icon],
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
          <span class="ov-mine__meta">
            {{ x.marches }}: {{ m.marches }}@if (m.missing) {<span class="ov-missing" [title]="x.missingTitle"> +{{ m.missing }}</span>}
            @if (m.power !== null) {
              · {{ x.powerShort }}: <span [class.is-over]="over(m)">{{ dec(m.power) }} M</span>
              @if (m.recommended !== null) {
                ({{ x.recommendedShort.replace('{m}', dec(m.recommended)) }})
              }
            }
          </span>
        </div>
      }
      <div class="ov-bar">
        <p class="ov-note">{{ x.published.replace('{date}', date(o.published_at)) }} {{ x.hint }}</p>
        @if (auth.user()?.approved) {
          <a class="pill-btn pill-btn--quiet ov-link" [routerLink]="i18n.path('playersMarches')" [queryParams]="{ tab: 'prehlad' }">{{ x.marchesLink }}</a>
        }
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
            <th scope="col" class="ev-num ov-rank">#</th>
            @for (c of columns; track c.key) {
              <th scope="col" [class.ev-num]="c.key !== 'name'" [class.ov-required]="c.key === 'required'" [attr.aria-sort]="ariaSort(c.key)">
                <button type="button" class="ov-sort" [class.is-active]="sort().key === c.key" (click)="sortBy(c.key)">
                  @if (c.short) {
                    <span class="ov-long">{{ x[c.label] }}</span><span class="ov-short">{{ x[c.short] }}</span>
                  } @else {
                    {{ x[c.label] }}
                  }
                  <svg
                    class="ov-sort__icon"
                    appIcon="chevron-down"
                    [class.is-up]="sort().key === c.key && !sort().desc"
                    aria-hidden="true"
                  ></svg>
                </button>
              </th>
            }
          </tr>
        </thead>
        <tbody>
          @for (r of rows(); track r.row.id) {
            <tr [id]="'ev-player-' + r.row.id" [class.is-you]="r.row.you" [class.is-focus]="r.row.id === focus()">
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
              <td class="ev-num ov-power">
                @if (r.row.power !== null) {
                  <span class="ov-power__now" [class.is-over]="over(r.row)" [title]="over(r.row) ? x.overTitle : ''">{{ dec(r.row.power) }}</span>
                } @else {
                  <span class="ov-power__none">–</span>
                }
                @if (r.row.recommended !== null) {
                  <small class="ov-power__rec">{{ x.recommendedShort.replace('{m}', dec(r.row.recommended)) }}</small>
                }
              </td>
              <td class="ev-num ov-required">{{ int(r.row.required) }}</td>
            </tr>
          } @empty {
            <tr>
              <td colspan="5" class="ov-empty">{{ x.empty }}</td>
            </tr>
          }
        </tbody>
      </table>
      <p class="ov-legend">{{ x.legend }}</p>
    }
  `,
  styleUrl: './overview-tab.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EvalOverviewTab {
  readonly overview = input.required<Overview<OverviewPlayer>>();
  readonly texts = input.required<EvalTexts>();
  /** ?hrac= of the page – that player's row is highlighted */
  readonly focus = input<number | null>(null);

  protected readonly i18n = inject(I18n);
  protected readonly auth = inject(Auth);
  protected readonly search = signal('');
  /** a phone shows the short header (CSS) – the long one would push the table wider than the screen */
  protected readonly columns: {
    key: SortKey;
    label: 'player' | 'marches' | 'power' | 'required';
    short?: 'powerShort' | 'requiredShort';
  }[] = [
    { key: 'name', label: 'player' },
    { key: 'marches', label: 'marches' },
    { key: 'power', label: 'power', short: 'powerShort' },
    { key: 'required', label: 'required', short: 'requiredShort' },
  ];
  /** the highest required acclaim first; names A–Z, numbers from the highest when a header is clicked first */
  protected readonly sort = signal<{ key: SortKey; desc: boolean }>({ key: 'required', desc: true });
  protected readonly over = overOwn;

  /** the rank is the required acclaim's – it stays while sorting by something else or searching */
  private readonly ranked = computed(() =>
    [...this.overview().rows]
      .sort((a, b) => b.required - a.required || a.name.localeCompare(b.name))
      .map((row, i) => ({ row, rank: i + 1 })),
  );
  protected readonly rows = computed(() => {
    const query = fold(this.search());
    const { key, desc } = this.sort();
    const value = (r: OverviewPlayer): number | null =>
      key === 'marches' ? r.marches + r.missing / 100 : key === 'power' ? r.power : key === 'required' ? r.required : null;
    const rows = query ? this.ranked().filter((r) => fold(r.row.name).includes(query)) : [...this.ranked()];
    return rows.sort((a, b) => {
      if (key === 'name') return (desc ? -1 : 1) * a.row.name.localeCompare(b.row.name);
      const x = value(a.row);
      const y = value(b.row);
      // no power written down: always last
      if (x === null || y === null) return x === y ? a.rank - b.rank : x === null ? 1 : -1;
      return (desc ? y - x : x - y) || a.rank - b.rank;
    });
  });
  protected readonly mine = computed(() => this.overview().rows.find((r) => r.you) ?? null);

  protected sortBy(key: SortKey): void {
    const now = this.sort();
    this.sort.set(now.key === key ? { key, desc: !now.desc } : { key, desc: key !== 'name' });
  }

  protected ariaSort(key: SortKey): 'ascending' | 'descending' | null {
    const now = this.sort();
    return now.key !== key ? null : now.desc ? 'descending' : 'ascending';
  }

  protected int(n: number): string {
    return new Intl.NumberFormat(this.i18n.locale(), { maximumFractionDigits: 0 }).format(n);
  }

  protected dec(n: number): string {
    return new Intl.NumberFormat(this.i18n.locale(), { maximumFractionDigits: 1 }).format(n);
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

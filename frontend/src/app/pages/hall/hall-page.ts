import { HttpClient } from '@angular/common/http';
import { NgTemplateOutlet, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Auth } from '../../core/auth';
import { I18n } from '../../core/i18n/i18n';
import { Seo } from '../../core/seo';
import { Icon } from '../../shared/icon';
import { PendingApproval } from '../../shared/pending-approval';
import { plural } from '../reminders/format';
import { HallAdmin } from './hall-admin';
import { HALL_ICONS, HONOURS, HallCategory, HallData, HallEntry, TRIOS, portrait } from './hall-data';

/**
 * Kill points the way players say them (Gether 28. 10. 2026: "v biliónoch, teda 2.3B, 1.4B"): 2273581583 → "2.3B",
 * 842998273 → "843M", with a dot like the game
 */
/** up to this many columns stand in one row */
const ONE_ROW = 4;

export function shortKp(n: number): string {
  const [value, unit] = n >= 1e9 ? [n / 1e9, 'B'] : n >= 1e6 ? [n / 1e6, 'M'] : [n, ''];
  return (unit ? value.toFixed(value >= 100 ? 0 : 1).replace(/\.0$/, '') : String(value)) + unit;
}

/**
 * /sien-slavy – the Hall of Fame (Gether 28. 10. 2026: "kde budú určití naši hráči vyznamenaní za určité kritériá …
 * nech sa ľudia v sieni cítia dobre a dôležito"): a gladiators' arena (img/hall/arena.svg from tools/background/generate.py)
 * as a colonnade – each category's one champion (Gether: "vždy bude len 1 top hráč") a bust on a stone column, three
 * on a raised step, the others below – and, in the corner, the
 * mascots' "Kútik hanby": two clowns cut out of Gether's picture (img/hall/clowns.webp, tools/hall/cutout.py) with
 * the two names on plates under them. Approved players only; the superadmin fills it in on the second tab
 * (?tab=upravit). Not indexed, the API in the browser only.
 */
@Component({
  selector: 'app-hall-page',
  imports: [NgTemplateOutlet, RouterLink, Icon, PendingApproval, HallAdmin],
  templateUrl: './hall-page.html',
  styleUrls: ['../reminders/reminders-page.scss', './hall-page.scss', './hall-corners.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HallPage {
  /** ?tab=upravit – the superadmin's editor */
  readonly tab = input<string>();

  protected readonly i18n = inject(I18n);
  protected readonly auth = inject(Auth);
  protected readonly t = this.i18n.t;
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly data = signal<HallData | null>(null);
  protected readonly failed = signal(false);
  protected readonly icons = HALL_ICONS;
  protected readonly portrait = portrait;

  protected readonly allowed = computed(() => !!this.auth.user()?.approved || !!this.auth.user()?.is_superuser);
  protected readonly editing = computed(() => this.tab() === 'upravit' && !!this.auth.user()?.is_superuser);

  /** a column per category with someone on it – its places in order (the fort destroyers have three) */
  protected readonly columns = computed(() => {
    const entries = this.data()?.entries ?? [];
    return HONOURS.map((category) => ({
      category,
      entries: entries.filter((e) => e.category === category).sort((a, b) => a.place - b.place),
    })).filter((column) => column.entries.length);
  });
  /** the top-3 columns on the raised step, the single champions below them */
  protected readonly upper = computed(() => this.columns().filter((c) => TRIOS.includes(c.category)));
  protected readonly lower = computed(() => this.columns().filter((c) => !TRIOS.includes(c.category)));
  /**
   * Few columns stand in one row (Gether 28. 10. 2026: "pokiaľ nie je veľa kategórií a zmestia sa vedľa seba"): the
   * top-3 ones in the middle, the single champions on both sides; more than ONE_ROW split into the two tiers.
   */
  protected readonly oneRow = computed(() => {
    const cols = this.columns();
    if (cols.length > ONE_ROW) return null;
    const singles = this.lower();
    const half = Math.ceil(singles.length / 2);
    return [...singles.slice(0, half), ...this.upper(), ...singles.slice(half)];
  });
  /** the other corner: the three zeroed most in the last KvK, in order */
  protected readonly zeros = computed(() =>
    (this.data()?.entries ?? []).filter((e) => e.category === 'zero').sort((a, b) => a.place - b.place),
  );
  protected readonly mascots = computed(() =>
    (this.data()?.entries ?? []).filter((e) => e.category === 'mascot').sort((a, b) => a.place - b.place),
  );

  constructor() {
    const seo = inject(Seo);
    effect(() => seo.set({ ...this.t().seo.hall, noindex: true }));
    inject(DestroyRef).onDestroy(() => seo.set(null));
    // loaded once the visitor may see it, and again on coming back from the editor
    effect(() => {
      if (!this.isBrowser || !this.allowed() || this.editing()) return;
      untracked(() => void this.load());
    });
  }

  private async load(): Promise<void> {
    this.failed.set(false);
    try {
      this.data.set(await firstValueFrom(this.http.get<HallData>('/api/hall/')));
    } catch {
      this.failed.set(true);
    }
  }

  protected showTab(tab: 'upravit' | null): void {
    void this.router.navigate([], { queryParams: { tab }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected title(category: HallCategory): string {
    return this.t().hall.categories[category].title;
  }

  /** a top-3 category – the ranking with the numbers, also before all three places are filled */
  protected isTrio(category: HallCategory): boolean {
    return TRIOS.includes(category);
  }

  protected icon(category: HallCategory) {
    return HALL_ICONS[category];
  }

  /** "250 pevností", "1,2 mld. KP" – the number the superadmin entered, '' without one */
  protected amount(entry: HallEntry): string {
    const text = (entry.count ?? '').trim();
    if (!text) return '';
    const h = this.t().hall;
    // digits alone: "250 pevností", "2.3B"; anything else as written – no "KP" after it (Gether 28. 10. 2026)
    if (/^\d+$/.test(text)) {
      const n = Number(text);
      return entry.category === 'forts' ? plural(n, h.forts) : shortKp(n);
    }
    return text;
  }

  /** "za posledný týždeň" under the title of a top 3 */
  protected period(category: HallCategory): string {
    return (this.t().hall.categories as Record<string, { period?: string }>)[category]?.period ?? '';
  }

  protected note(entry: HallEntry): string {
    return entry.note[this.i18n.lang()];
  }

  /** the first letter of the name – the portrait of a name without a picture */
  protected initial(entry: HallEntry): string {
    return [...entry.name.trim()][0]?.toUpperCase() ?? '?';
  }
}

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
import { marchIcon } from '../../core/kvk-api';
import { I18n } from '../../core/i18n/i18n';
import { Seo } from '../../core/seo';
import { Icon } from '../../shared/icon';
import { PendingApproval } from '../../shared/pending-approval';
import { HallAdmin } from './hall-admin';
import {
  EquipmentTroop,
  HALL_ICONS,
  HALL_ORDER,
  HONOURS,
  HallCategory,
  HallData,
  HallEntry,
  TRIOS,
  archiveDate,
  portrait,
  troopOfPlace,
  weekRange,
} from './hall-data';

/** up to this many columns stand in one row */
const ONE_ROW = 4;

/**
 * Kill points the way players say them (Gether 28. 10. 2026: "v biliónoch, teda 2.3B, 1.4B"): 2273581583 → "2.3B",
 * 842998273 → "843M", with a dot like the game
 */
export function shortKp(n: number): string {
  const [value, unit] = n >= 1e9 ? [n / 1e9, 'B'] : n >= 1e6 ? [n / 1e6, 'M'] : [n, ''];
  return (unit ? value.toFixed(value >= 100 ? 0 : 1).replace(/\.0$/, '') : String(value)) + unit;
}

/**
 * The banners with the most names in the middle (Gether 29. 10. 2026: "listy s najviac hodnotami sa držali v strede"):
 * the longest one in the centre, the next ones alternately on its left and right; a tie keeps the given order.
 */
export function centreOut<T extends { entries: readonly unknown[] }>(columns: readonly T[]): T[] {
  const bySize = columns
    .map((column, i) => ({ column, i }))
    .sort((a, b) => b.column.entries.length - a.column.entries.length || a.i - b.i);
  const row: T[] = [];
  bySize.forEach(({ column }, i) => (i % 2 ? row.unshift(column) : row.push(column)));
  return row;
}

/**
 * /sien-slavy – the Hall of Fame (Gether 28. 10. 2026: "kde budú určití naši hráči vyznamenaní za určité kritériá …
 * nech sa ľudia v sieni cítia dobre a dôležito"): a knights' tournament (img/hall/tournament.svg from tools/hall/tournament.py)
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
  styleUrls: [
    '../reminders/reminders-page.scss',
    './hall-page.scss',
    './hall-corners.scss',
    './hall-tournament.scss',
    './hall-legends.scss',
  ],
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
  /** the top-3 columns on the raised step (the longest in the middle), the single champions below them */
  protected readonly upper = computed(() => centreOut(this.columns().filter((c) => TRIOS.includes(c.category))));
  protected readonly lower = computed(() => this.columns().filter((c) => !TRIOS.includes(c.category)));
  /**
   * Few columns stand in one row (Gether 28. 10. 2026: "pokiaľ nie je veľa kategórií a zmestia sa vedľa seba"): the
   * longest banner in the middle, the shorter ones towards the sides; more than ONE_ROW split into the two tiers.
   */
  protected readonly oneRow = computed(() => {
    const cols = this.columns();
    return cols.length > ONE_ROW ? null : centreOut(cols);
  });
  /** the other corner: the three zeroed most in the last KvK, in order */
  protected readonly zeros = computed(() =>
    (this.data()?.entries ?? []).filter((e) => e.category === 'zero').sort((a, b) => a.place - b.place),
  );
  protected readonly mascots = computed(() =>
    (this.data()?.entries ?? []).filter((e) => e.category === 'mascot').sort((a, b) => a.place - b.place),
  );
  /**
   * Sieň legiend (3. 11. 2026): the archived halls, newest first – per category the names in place order, the
   * categories in the order of the hall
   */
  protected readonly legends = computed(() =>
    (this.data()?.archive ?? []).map((archive) => ({
      id: archive.id,
      label: archive.label,
      created_at: archive.created_at,
      // a week of the fort destroyers: the days are the title – the category under it says what it is (Gether 8. 11.
      // 2026: "zbytočne tam je názov"); another archive ("KvK 3") its name and the day it was saved
      week: weekRange(archive.week_from, archive.week_to),
      date: archiveDate(archive.created_at, this.i18n.locale()),
      categories: HALL_ORDER.map((category) => ({
        category,
        entries: archive.entries.filter((e) => e.category === category).sort((a, b) => a.place - b.place),
      })).filter((c) => c.entries.length),
    })),
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

  /** "250", "2.3B" – the number the superadmin entered, '' without one */
  protected amount(entry: Pick<HallEntry, 'category' | 'count'>): string {
    const text = (entry.count ?? '').trim();
    if (!text) return '';
    // digits alone: "250", "2.3B"; anything else as written – no "KP" (Gether 28. 10. 2026) nor "pevností" after it
    if (/^\d+$/.test(text)) {
      const n = Number(text);
      // forts: the number alone, the banner says what it is (Gether 8. 11. 2026)
      return entry.category === 'forts' ? String(n) : shortKp(n);
    }
    return text;
  }

  /** the places that are a ranking (the fort destroyers, the KP) – the others are equal or a troop type each */
  protected ranked(category: HallCategory): boolean {
    return category === 'forts' || category === 'kp';
  }

  /**
   * "za posledný týždeň" under the title of a top 3 – at the fort destroyers the week itself once the superadmin saved
   * it ("27. 10. – 2. 11. 2026", Gether 7. 11. 2026). The reasons under the names are gone ("to nepoužívam vôbec").
   */
  protected period(category: HallCategory): string {
    const week = this.data()?.forts_week;
    const days = category === 'forts' ? weekRange(week?.from, week?.to) : '';
    return days || ((this.t().hall.categories as Record<string, { period?: string }>)[category]?.period ?? '');
  }

  /** the troop type of a place of the best equipment, null elsewhere */
  protected troop(entry: Pick<HallEntry, 'category' | 'place'>): EquipmentTroop | null {
    return entry.category === 'equipment' ? troopOfPlace(entry.place) : null;
  }

  protected troopName(troop: EquipmentTroop): string {
    return this.t().marches.build.troops[troop];
  }

  protected troopIcon(troop: EquipmentTroop): string {
    return marchIcon(troop);
  }

  /** the first letter of the name – the portrait of a name without a picture */
  protected initial(entry: HallEntry): string {
    return [...entry.name.trim()][0]?.toUpperCase() ?? '?';
  }
}

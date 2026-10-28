import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
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
import { PageHeader } from '../../shared/page-header';
import { PendingApproval } from '../../shared/pending-approval';
import { HallAdmin } from './hall-admin';
import { HALL_ICONS, HONOURS, HallCategory, HallData, HallEntry, portrait } from './hall-data';

/**
 * /sien-slavy – the Hall of Fame (Gether 28. 10. 2026: "kde budú určití naši hráči vyznamenaní za určité kritériá …
 * nech sa ľudia v sieni cítia dobre a dôležito"): a stone hall (img/hall/hall.svg from tools/background/generate.py)
 * as a colonnade – each category's one champion (Gether: "vždy bude len 1 top hráč") a bust on a stone column, three
 * on a raised step, the others below – and, in the corner, the
 * mascots' "Kútik hanby": two clowns cut out of Gether's picture (img/hall/clowns.webp, tools/hall/cutout.py) with
 * the two names on plates under them. Approved players only; the superadmin fills it in on the second tab
 * (?tab=upravit). Not indexed, the API in the browser only.
 */
@Component({
  selector: 'app-hall-page',
  imports: [PageHeader, RouterLink, Icon, PendingApproval, HallAdmin],
  templateUrl: './hall-page.html',
  styleUrls: ['../reminders/reminders-page.scss', './hall-page.scss'],
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

  /** the champions, in the order of the hall's categories */
  protected readonly champions = computed(() => {
    const entries = this.data()?.entries ?? [];
    return HONOURS.map((category) => entries.find((e) => e.category === category)).filter((e): e is HallEntry => !!e);
  });
  /** the first three on the raised step (the middle one highest), the rest below them */
  protected readonly upper = computed(() => this.champions().slice(0, 3));
  protected readonly lower = computed(() => this.champions().slice(3));
  /** the other corner: the three zeroed most in the last KvK, in order */
  protected readonly zeros = computed(() =>
    (this.data()?.entries ?? []).filter((e) => e.category === 'zero').sort((a, b) => a.place - b.place),
  );
  protected readonly mascots = computed(() =>
    (this.data()?.entries ?? []).filter((e) => e.category === 'mascot').sort((a, b) => a.place - b.place),
  );

  protected readonly crumbs = computed(() => [
    { label: this.t().nav.home, link: this.i18n.path('home') },
    { label: this.t().hall.title, link: this.i18n.path('hall') },
  ]);

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

  protected note(entry: HallEntry): string {
    return entry.note[this.i18n.lang()];
  }

  /** the first letter of the name – the portrait of a name without a picture */
  protected initial(entry: HallEntry): string {
    return [...entry.name.trim()][0]?.toUpperCase() ?? '?';
  }
}

import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { GUIDE_SPECIALTIES, GuideSpecialty, GuideSummary, GuidesApi } from '../../core/guides-api';
import { GUIDE_CATEGORIES, I18n } from '../../core/i18n/i18n';
import { Seo } from '../../core/seo';
import { Icon } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';
import { Reveal } from '../../shared/reveal';
import { fold } from '../../shared/search';
import { CommanderFinder } from './commander-finder';
import { MyCommanders } from './my-commanders';

/**
 * /navody – every published guide on one page, grouped by category. Above them a search (title and intro in both
 * languages, without diacritics, every word must match) and chips of the commander specialties that some guide has;
 * while either is set, a flat list of the matches takes the place of the rest of the hub. Both live in the URL
 * (?q=, ?typ=garrison,cavalry) – a shared link and back/forward keep them.
 */
@Component({
  selector: 'app-guide-hub',
  imports: [RouterLink, RouterLinkActive, Icon, PageHeader, Reveal, CommanderFinder, MyCommanders],
  templateUrl: './guide-hub.html',
  styleUrl: './guides.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuideHub {
  /** ?commander= – the commander chosen in "Nájdi pár pre commandera" */
  readonly commander = input<string>();
  /** ?q= – the search */
  readonly q = input<string>();
  /** ?typ= – the chosen specialties, comma separated */
  readonly typ = input<string>();

  private readonly router = inject(Router);

  protected readonly i18n = inject(I18n);
  protected readonly guides = inject(GuidesApi);
  protected readonly categories = GUIDE_CATEGORIES;

  /** categories with at least one guide, in the fixed order */
  protected readonly groups = computed(() =>
    GUIDE_CATEGORIES.map((key) => ({ key, items: this.guides.byCategory(key) })).filter((g) => g.items.length),
  );
  protected readonly query = computed(() => this.q() ?? '');
  protected readonly chosen = computed(
    () => new Set((this.typ() ?? '').split(',').filter((s): s is GuideSpecialty => GUIDE_SPECIALTIES.includes(s as GuideSpecialty))),
  );
  /** the specialties some guide has, in the fixed order, with the game's tag */
  protected readonly specialties = computed(() => {
    const icons = new Map(this.guides.all().map((g) => [g.specialty, g.specialty_icon]));
    return GUIDE_SPECIALTIES.filter((key) => icons.get(key)).map((key) => ({ key, icon: icons.get(key)! }));
  });
  protected readonly searching = computed(() => !!fold(this.query()) || this.chosen().size > 0);
  protected readonly results = computed(() => {
    const words = fold(this.query()).split(/\s+/).filter(Boolean);
    const chosen = this.chosen();
    return this.guides
      .all()
      .filter((g) => !chosen.size || chosen.has(g.specialty as GuideSpecialty))
      .filter((g) => {
        const text = this.haystack(g);
        return words.every((word) => text.includes(word));
      });
  });

  protected readonly crumbs = computed(() => [
    { label: this.i18n.t().nav.home, link: this.i18n.path('home') },
    { label: this.i18n.t().nav.guides, link: this.i18n.path('guideHub') },
  ]);

  /** what a guide is found by: both titles, the intro in the page language, its category and specialty */
  private haystack(g: GuideSummary): string {
    const t = this.i18n.t().guides;
    const specialty = g.specialty ? t.search.specialties[g.specialty] : '';
    return fold([g.title_sk, g.title_cs, this.guides.excerpt(g), t.categories[g.category].title, specialty].join(' '));
  }

  protected setQuery(value: string): void {
    this.navigate({ q: value || null });
  }

  protected toggle(key: GuideSpecialty): void {
    const chosen = new Set(this.chosen());
    if (chosen.has(key)) chosen.delete(key);
    else chosen.add(key);
    this.navigate({ typ: GUIDE_SPECIALTIES.filter((s) => chosen.has(s)).join(',') || null });
  }

  protected clear(): void {
    this.navigate({ q: null, typ: null });
  }

  private navigate(queryParams: Record<string, string | null>): void {
    void this.router.navigate([], { queryParams, queryParamsHandling: 'merge', replaceUrl: true });
  }

  constructor() {
    const seo = inject(Seo);
    effect(() => seo.set({ ...this.i18n.t().seo.guideHub, breadcrumbs: this.crumbs() }));
    inject(DestroyRef).onDestroy(() => seo.set(null));
  }
}

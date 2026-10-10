import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { GuidesApi } from '../../core/guides-api';
import { GUIDE_CATEGORIES, I18n } from '../../core/i18n/i18n';
import { Seo } from '../../core/seo';
import { Icon } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';
import { Reveal } from '../../shared/reveal';

/** /navody – every published guide on one page, grouped by category. */
@Component({
  selector: 'app-guide-hub',
  imports: [RouterLink, RouterLinkActive, Icon, PageHeader, Reveal],
  templateUrl: './guide-hub.html',
  styleUrl: './guides.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuideHub {
  protected readonly i18n = inject(I18n);
  protected readonly guides = inject(GuidesApi);
  protected readonly categories = GUIDE_CATEGORIES;

  /** categories with at least one guide, in the fixed order */
  protected readonly groups = computed(() =>
    GUIDE_CATEGORIES.map((key) => ({ key, items: this.guides.byCategory(key) })).filter((g) => g.items.length),
  );
  protected readonly crumbs = computed(() => [
    { label: this.i18n.t().nav.home, link: this.i18n.path('home') },
    { label: this.i18n.t().nav.guides, link: this.i18n.path('guideHub') },
  ]);

  constructor() {
    const seo = inject(Seo);
    effect(() => seo.set({ ...this.i18n.t().seo.guideHub, breadcrumbs: this.crumbs() }));
    inject(DestroyRef).onDestroy(() => seo.set(null));
  }
}

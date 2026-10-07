import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { GuidesApi } from '../../core/guides-api';
import { GUIDE_CATEGORIES, GuideCategory, I18n } from '../../core/i18n/i18n';
import { Seo } from '../../core/seo';
import { Icon } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';
import { Reveal } from '../../shared/reveal';

/** /navody/:category – clickable list of guides in one category. */
@Component({
  selector: 'app-guide-list',
  imports: [RouterLink, RouterLinkActive, Icon, PageHeader, Reveal],
  templateUrl: './guide-list.html',
  styleUrl: './guides.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuideList {
  /** route parameter */
  readonly category = input.required<string>();

  protected readonly i18n = inject(I18n);
  protected readonly guides = inject(GuidesApi);
  protected readonly categories = GUIDE_CATEGORIES;

  protected readonly key = computed(() =>
    GUIDE_CATEGORIES.includes(this.category() as GuideCategory) ? (this.category() as GuideCategory) : null,
  );
  protected readonly info = computed(() => {
    const key = this.key();
    return key ? this.i18n.t().guides.categories[key] : null;
  });
  protected readonly items = computed(() => {
    const key = this.key();
    return key ? this.guides.byCategory(key) : [];
  });
  protected readonly crumbs = computed(() => {
    const t = this.i18n.t();
    const key = this.key();
    return [
      { label: t.nav.home, link: this.i18n.path('home') },
      ...(key ? [{ label: t.guides.categories[key].title, link: this.i18n.guidePath(key) }] : []),
    ];
  });

  constructor() {
    const seo = inject(Seo);
    effect(() => {
      const info = this.info();
      if (!info) return;
      seo.set({
        title: `${info.title} – ${this.i18n.t().seo.guides}`,
        description: info.description,
        breadcrumbs: this.crumbs(),
      });
    });
    inject(DestroyRef).onDestroy(() => seo.set(null));
  }
}

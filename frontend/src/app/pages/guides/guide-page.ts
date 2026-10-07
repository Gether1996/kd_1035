import { isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse, httpResource } from '@angular/common/http';
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
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { GuideDetail, GuidesApi } from '../../core/guides-api';
import { GUIDE_CATEGORIES, GuideCategory, I18n } from '../../core/i18n/i18n';
import { Seo } from '../../core/seo';
import { Breadcrumbs } from '../../shared/breadcrumbs';
import { Icon } from '../../shared/icon';

/** /navody/:category/:slug – one guide; its HTML comes from the admin. */
@Component({
  selector: 'app-guide-page',
  imports: [RouterLink, Breadcrumbs, Icon],
  templateUrl: './guide-page.html',
  styleUrl: './guides.scss',
  host: { '(document:keydown.escape)': 'lightbox.set(null)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuidePage {
  /** route parameters */
  readonly category = input.required<string>();
  readonly slug = input.required<string>();

  protected readonly i18n = inject(I18n);
  protected readonly guides = inject(GuidesApi);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly res = httpResource<GuideDetail>(() =>
    this.isBrowser ? `/api/guides/${encodeURIComponent(this.slug())}/` : undefined,
  );

  protected readonly guide = computed(() => (this.res.hasValue() ? this.res.value() : null));
  protected readonly notFound = computed(() => {
    const error = this.res.error();
    return error instanceof HttpErrorResponse && error.status === 404;
  });
  protected readonly failed = computed(() => !!this.res.error() && !this.notFound());

  protected readonly categoryKey = computed(() => {
    const key = (this.guide()?.category ?? this.category()) as GuideCategory;
    return GUIDE_CATEGORIES.includes(key) ? key : null;
  });
  protected readonly title = computed(() => {
    const g = this.guide();
    return g ? this.guides.title(g) : '';
  });
  /** Already cleaned by the backend (nh3) when saved – trusted so embeds and inline styles survive. */
  protected readonly content = computed(() => {
    const g = this.guide();
    return g ? this.sanitizer.bypassSecurityTrustHtml(this.guides.html(g)) : '';
  });

  protected readonly crumbs = computed(() => {
    const t = this.i18n.t();
    const key = this.categoryKey();
    return [
      { label: t.nav.home, link: this.i18n.path('home') },
      ...(key ? [{ label: t.guides.categories[key].title, link: this.i18n.guidePath(key) }] : []),
      ...(this.guide() ? [{ label: this.title(), link: this.i18n.guidePath(this.category(), this.slug()) }] : []),
    ];
  });

  /** image from the article shown full screen */
  protected readonly lightbox = signal<string | null>(null);

  protected zoom(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (target instanceof HTMLImageElement && !target.closest('a')) this.lightbox.set(target.currentSrc || target.src);
  }

  constructor() {
    const seo = inject(Seo);
    const router = inject(Router);

    effect(() => {
      const g = this.guide();
      if (!g) return;
      // a guide moved to another category in the admin → correct address
      if (g.category !== this.category()) {
        router.navigateByUrl(this.i18n.guidePath(g.category, g.slug), { replaceUrl: true });
        return;
      }
      seo.set({
        title: `${this.title()} | KD 1035`,
        description: this.guides.excerpt(g),
        breadcrumbs: this.crumbs(),
      });
    });
    inject(DestroyRef).onDestroy(() => seo.set(null));
  }
}

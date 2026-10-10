import { isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse, httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  Injector,
  PLATFORM_ID,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { GuideDetail, GuidesApi } from '../../core/guides-api';
import { GUIDE_CATEGORIES, GuideCategory, I18n } from '../../core/i18n/i18n';
import { Seo } from '../../core/seo';
import { Breadcrumbs } from '../../shared/breadcrumbs';
import { copyLink } from '../../shared/copy-link';
import { Icon } from '../../shared/icon';
import { NotFoundLinks, notFoundMeta } from '../../shared/not-found';
import { GuideEvents } from './guide-events';
import { relatedGuides } from './related';

/** /navody/:category/:slug – one guide; its HTML comes from the admin. */
@Component({
  selector: 'app-guide-page',
  imports: [RouterLink, Breadcrumbs, GuideEvents, Icon, NotFoundLinks],
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
  private readonly doc = inject(DOCUMENT);
  private readonly injector = inject(Injector);
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
  /** events linked to the guide with their next run – the "V kalendári" card (older API: none) */
  protected readonly events = computed(() => this.guide()?.events ?? []);
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
      { label: t.nav.guides, link: this.i18n.path('guideHub') },
      ...(key ? [{ label: t.guides.categories[key].title, link: this.i18n.guidePath(key) }] : []),
      ...(this.guide() ? [{ label: this.title(), link: this.i18n.guidePath(this.category(), this.slug()) }] : []),
    ];
  });

  /** "Súvisiace návody" – only once both the guide and the list are loaded; none without a match or on a list error */
  protected readonly related = computed(() => {
    const g = this.guide();
    return g && this.guides.ready() ? relatedGuides(g, this.guides.all()) : [];
  });

  /** "Kopírovať odkaz": 'copied' for a moment, or the URL to copy by hand when neither clipboard nor share worked */
  protected readonly copied = signal(false);
  protected readonly manualUrl = signal('');
  private readonly manualInput = viewChild<ElementRef<HTMLInputElement>>('manual');
  private copiedTimer?: ReturnType<typeof setTimeout>;

  /** No `await` before copyLink(): the clipboard needs the click's user activation. */
  protected copyLink(): void {
    const g = this.guide();
    if (!g) return;
    // the page's own address in its language, without a query or hash
    const url = this.doc.location.origin + this.i18n.guidePath(g.category, g.slug);
    copyLink(url, this.title()).then((result) => {
      clearTimeout(this.copiedTimer);
      this.copied.set(result === 'copied');
      this.manualUrl.set(result === 'failed' ? url : '');
      if (result === 'copied') this.copiedTimer = setTimeout(() => this.copied.set(false), 2500);
      if (result === 'failed') {
        afterNextRender(
          () => {
            const input = this.manualInput()?.nativeElement;
            input?.focus();
            input?.select();
          },
          { injector: this.injector },
        );
      }
    });
  }

  /** image from the article shown full screen */
  protected readonly lightbox = signal<string | null>(null);

  protected zoom(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (target instanceof HTMLImageElement && !target.closest('a')) this.lightbox.set(target.currentSrc || target.src);
  }

  constructor() {
    const seo = inject(Seo);
    const router = inject(Router);

    // a related guide opens in this same component: no copy feedback from the previous guide
    effect(() => {
      this.slug();
      clearTimeout(this.copiedTimer);
      this.copied.set(false);
      this.manualUrl.set('');
    });

    effect(() => {
      // unknown or unpublished slug: the app shell answers 200 here, so keep the page out of search results
      if (this.notFound()) {
        seo.set(notFoundMeta(this.i18n.t()));
        return;
      }
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
    inject(DestroyRef).onDestroy(() => {
      seo.set(null);
      clearTimeout(this.copiedTimer);
    });
  }
}

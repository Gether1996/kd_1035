import { isPlatformBrowser } from '@angular/common';
import { DOCUMENT, Injectable, PLATFORM_ID, effect, inject, signal } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { KingdomApi } from './api';
import { I18n, Lang } from './i18n/i18n';

const OG_LOCALE: Record<Lang, string> = { sk: 'sk_SK', cs: 'cs_CZ' };

export interface Crumb {
  label: string;
  link: string;
}

export interface PageMeta {
  title: string;
  description: string;
  breadcrumbs?: Crumb[];
  /** private pages (the player's account) – <meta name="robots" content="noindex"> */
  noindex?: boolean;
}

/**
 * Title, description, canonical + hreflang alternates, Open Graph and JSON-LD for the current page.
 * Fixed pages take their texts from the dictionaries, pages with database content call `set()`.
 * Prerendered HTML contains the `__SITE_ORIGIN__` placeholder, which nginx swaps for the real origin.
 */
@Injectable({ providedIn: 'root' })
export class Seo {
  private readonly doc = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly override = signal<PageMeta | null>(null);

  constructor() {
    const i18n = inject(I18n);
    const title = inject(Title);
    const meta = inject(Meta);
    const api = inject(KingdomApi);

    effect(() => {
      const lang = i18n.lang();
      const page = i18n.page();
      const t = i18n.t();
      const fixed = page === 'home' || page === 'about' || page === 'terms' ? t.seo[page] : null;
      const current: PageMeta = this.override() ?? fixed ?? t.seo.home;
      const origin = this.origin();
      const url = (l: Lang = lang) => origin + i18n.switchPath(l);

      title.setTitle(current.title);
      meta.updateTag({ name: 'description', content: current.description });
      meta.updateTag({ property: 'og:title', content: current.title });
      meta.updateTag({ property: 'og:description', content: current.description });
      meta.updateTag({ property: 'og:url', content: url() });
      meta.updateTag({ property: 'og:locale', content: OG_LOCALE[lang] });
      meta.updateTag({ property: 'og:locale:alternate', content: OG_LOCALE[lang === 'sk' ? 'cs' : 'sk'] });
      meta.updateTag({ property: 'og:image', content: `${origin}/og-image.jpg` });
      if (current.noindex) meta.updateTag({ name: 'robots', content: 'noindex' });
      else meta.removeTag('name="robots"');

      this.link('canonical', url());
      this.link('alternate', url('sk'), 'sk');
      this.link('alternate', url('cs'), 'cs');
      this.link('alternate', url('sk'), 'x-default');

      const links = Object.values(api.links()).filter(Boolean);
      const graph: object[] = [
        {
          '@type': 'WebSite',
          '@id': `${origin}/#website`,
          name: 'Kingdom 1035',
          alternateName: ['KD 1035', 'Rise of Kingdoms KD 1035', 'CZ/SK Kingdom 1035'],
          url: `${origin}/`,
          inLanguage: ['sk', 'cs'],
        },
        {
          '@type': 'Organization',
          '@id': `${origin}/#kingdom`,
          name: 'Kingdom 1035 – Rise of Kingdoms CZ/SK',
          url: `${origin}/`,
          logo: `${origin}/icons/icon-512.png`,
          description: t.seo.home.description,
          ...(links.length ? { sameAs: links } : {}),
        },
      ];
      const crumbs = this.override()?.breadcrumbs;
      if (crumbs?.length) {
        graph.push({
          '@type': 'BreadcrumbList',
          itemListElement: crumbs.map((c, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: c.label,
            item: origin + c.link,
          })),
        });
      }
      this.jsonLd({ '@context': 'https://schema.org', '@graph': graph });
    });
  }

  /** Meta for a page with database content; pass null when the page is left. */
  set(meta: PageMeta | null): void {
    this.override.set(meta);
  }

  private origin(): string {
    const fromServer = this.doc.querySelector('meta[name="site-origin"]')?.getAttribute('content') ?? '';
    if (fromServer && !fromServer.startsWith('__')) return fromServer.replace(/\/$/, '');
    return this.isBrowser ? location.origin : '__SITE_ORIGIN__';
  }

  private link(rel: string, href: string, hreflang?: string): void {
    const selector = `link[rel="${rel}"]` + (hreflang ? `[hreflang="${hreflang}"]` : '');
    let el = this.doc.head.querySelector<HTMLLinkElement>(selector);
    if (!el) {
      el = this.doc.createElement('link');
      el.rel = rel;
      if (hreflang) el.hreflang = hreflang;
      this.doc.head.appendChild(el);
    }
    el.setAttribute('href', href);
  }

  private jsonLd(data: object): void {
    let el = this.doc.head.querySelector<HTMLScriptElement>('script[type="application/ld+json"]');
    if (!el) {
      el = this.doc.createElement('script');
      el.type = 'application/ld+json';
      this.doc.head.appendChild(el);
    }
    el.textContent = JSON.stringify(data);
  }
}

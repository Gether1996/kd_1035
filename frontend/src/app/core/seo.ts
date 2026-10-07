import { isPlatformBrowser } from '@angular/common';
import { DOCUMENT, Injectable, PLATFORM_ID, effect, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { KingdomApi } from './api';
import { I18n, Lang } from './i18n/i18n';

const OG_LOCALE: Record<Lang, string> = { sk: 'sk_SK', cs: 'cs_CZ' };

/**
 * Title, description, canonical + hreflang alternates, Open Graph and JSON-LD for the current page.
 * Prerendered HTML contains the `__SITE_ORIGIN__` placeholder, which nginx swaps for the real origin.
 */
@Injectable({ providedIn: 'root' })
export class Seo {
  private readonly doc = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  constructor() {
    const i18n = inject(I18n);
    const title = inject(Title);
    const meta = inject(Meta);
    const api = inject(KingdomApi);

    effect(() => {
      const lang = i18n.lang();
      const page = i18n.page();
      const t = i18n.t();
      const { title: pageTitle, description } = t.seo[page];
      const origin = this.origin();
      const url = (p = page, l: Lang = lang) => origin + i18n.path(p, l);

      title.setTitle(pageTitle);
      meta.updateTag({ name: 'description', content: description });
      meta.updateTag({ property: 'og:title', content: pageTitle });
      meta.updateTag({ property: 'og:description', content: description });
      meta.updateTag({ property: 'og:url', content: url() });
      meta.updateTag({ property: 'og:locale', content: OG_LOCALE[lang] });
      meta.updateTag({ property: 'og:locale:alternate', content: OG_LOCALE[lang === 'sk' ? 'cs' : 'sk'] });
      meta.updateTag({ property: 'og:image', content: `${origin}/og-image.jpg` });

      this.link('canonical', url());
      this.link('alternate', url(page, 'sk'), 'sk');
      this.link('alternate', url(page, 'cs'), 'cs');
      this.link('alternate', url(page, 'sk'), 'x-default');

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
      if (page === 'about') {
        graph.push({
          '@type': 'FAQPage',
          inLanguage: lang,
          mainEntity: t.aboutPage.faq.map((item) => ({
            '@type': 'Question',
            name: item.q,
            acceptedAnswer: { '@type': 'Answer', text: item.a },
          })),
        });
      }
      this.jsonLd({ '@context': 'https://schema.org', '@graph': graph });
    });
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

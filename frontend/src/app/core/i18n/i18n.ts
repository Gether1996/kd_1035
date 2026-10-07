import { PlatformLocation, isPlatformBrowser } from '@angular/common';
import { DOCUMENT, Injectable, PLATFORM_ID, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { cs } from './cs';
import { sk } from './sk';

export type Lang = 'sk' | 'cs';
export type Page = 'home' | 'about';

const DICTS = { sk, cs };
const LOCALES: Record<Lang, string> = { sk: 'sk-SK', cs: 'cs-CZ' };
/** Slovak lives at the root, Czech under /cz – each language has its own indexable URLs. */
const PREFIX: Record<Lang, string> = { sk: '', cs: '/cz' };
const SLUG: Record<Page, string> = { home: '', about: '/o-nas' };
const STORAGE_KEY = 'kd1035.lang';

export function parseUrl(url: string): { lang: Lang; page: Page } {
  const path = url.split(/[?#]/)[0].replace(/\/+$/, '');
  const lang: Lang = path === '/cz' || path.startsWith('/cz/') ? 'cs' : 'sk';
  const rest = path.slice(PREFIX[lang].length);
  return { lang, page: rest === SLUG.about ? 'about' : 'home' };
}

/** Language comes from the URL. Templates read `i18n.t().section.key`. */
@Injectable({ providedIn: 'root' })
export class I18n {
  private readonly router = inject(Router);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    // before the first navigation ends, read the address directly (keeps hydration consistent)
    { initialValue: inject(PlatformLocation).pathname },
  );
  private readonly route = computed(() => parseUrl(this.url()));

  readonly lang = computed(() => this.route().lang);
  readonly page = computed(() => this.route().page);
  readonly t = computed(() => DICTS[this.lang()]);
  readonly locale = computed(() => LOCALES[this.lang()]);

  constructor() {
    const doc = inject(DOCUMENT);
    effect(() => {
      doc.documentElement.lang = this.lang();
    });
  }

  /** URL of `page` in `lang` (current language by default). */
  path(page: Page, lang: Lang = this.lang()): string {
    return PREFIX[lang] + SLUG[page] || '/';
  }

  /** Stores an explicit choice made with the language switch. */
  remember(lang: Lang): void {
    if (!this.isBrowser) return;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // storage blocked (private mode) – the choice just isn't remembered
    }
  }

  /** Explicit choice from an earlier visit, otherwise Czech for a Czech browser. */
  preferred(): Lang | null {
    if (!this.isBrowser) return null;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'sk' || saved === 'cs') return saved;
    } catch {
      // ignore
    }
    return navigator.languages?.some((l) => l.toLowerCase().startsWith('cs')) ? 'cs' : null;
  }
}

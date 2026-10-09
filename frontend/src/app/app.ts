import { ViewportScroller } from '@angular/common';
import { ChangeDetectionStrategy, Component, DOCUMENT, afterNextRender, inject } from '@angular/core';
import { NavigationEnd, NavigationStart, Router, RouterOutlet, Scroll } from '@angular/router';
import { I18n, parseUrl } from './core/i18n/i18n';
import { Seo } from './core/seo';
import { Footer } from './layout/footer/footer';
import { Header } from './layout/header/header';
import { ScrollFx } from './shared/scroll-fx';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Header, Footer, ScrollFx],
  template: `
    <a class="skip-link" href="#main">{{ i18n.t().nav.skip }}</a>
    <app-header />
    <div class="page">
      <main id="main" tabindex="-1">
        <router-outlet />
      </main>
      <!-- night landscape: sticks to the bottom of the viewport behind the content and comes to rest
           on the footer at the end of the page, rising a little on the way -->
      <div class="backdrop" appScrollFx="page" aria-hidden="true">
        <img src="img/scenery/far.svg" alt="" decoding="async" style="--drift: 8%" />
        <img src="img/scenery/near.svg" alt="" decoding="async" style="--drift: 16%" />
      </div>
    </div>
    <app-footer />
  `,
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly i18n = inject(I18n);

  constructor() {
    inject(Seo);
    const router = inject(Router);
    const doc = inject(DOCUMENT);
    const scroller = inject(ViewportScroller);

    // section links land below the fixed header
    scroller.setOffset(() => [0, doc.querySelector('app-header')?.clientHeight ?? 0]);

    // new page → top; same page in the other language → keep the scroll position;
    // back/forward → where the visitor left that page. The browser's own restoration would run while the previous
    // page is still rendered and stop at its height (forward from /o-nas to /#alliance landed above the section).
    scroller.setHistoryScrollRestoration('manual');
    let previous = parseUrl(router.url).rest;
    let changed = false;
    let popstate = false;
    let restoring: AbortController | undefined;
    router.events.subscribe((e) => {
      if (e instanceof NavigationStart) {
        popstate = e.navigationTrigger === 'popstate';
        restoring?.abort();
      } else if (e instanceof NavigationEnd) {
        const rest = parseUrl(e.urlAfterRedirects).rest;
        changed = rest !== previous;
        previous = rest;
        const anchor = e.urlAfterRedirects.includes('#');
        if (changed && !popstate && !anchor) scroller.scrollToPosition([0, 0]);
      } else if (e instanceof Scroll && popstate) {
        // the router saved the position when the visitor left the page; after a reload it has none
        if (e.position) restoring = restore(scroller, e.position);
        else if (changed && !e.anchor) scroller.scrollToPosition([0, 0], { behavior: 'instant' });
      } else if (e instanceof Scroll && e.anchor) {
        // a section link (/#alliance): sections above it that load from the API afterwards would push it away
        restoring = follow(scroller, doc, e.anchor);
      }
    });

    afterNextRender(() => {
      // returning visitors get the language they chose last time (Czech browsers default to CZ)
      const preferred = this.i18n.preferred();
      if (preferred && preferred !== this.i18n.lang()) {
        router.navigateByUrl(this.i18n.switchPath(preferred) + location.hash, { replaceUrl: true });
      }
    });
  }
}

/**
 * Scrolls to `position` once the page is tall enough for it – a guide's content arrives from the API a moment after
 * the page is shown. Gives up after 2 s, or as soon as the visitor scrolls or clicks.
 */
function restore(scroller: ViewportScroller, [x, y]: [number, number]): AbortController {
  const restoring = new AbortController();
  const until = performance.now() + 2000;
  for (const type of ['wheel', 'touchstart', 'keydown', 'pointerdown']) {
    addEventListener(type, () => restoring.abort(), { passive: true, signal: restoring.signal });
  }
  const step = () => {
    if (restoring.signal.aborted) return;
    scroller.scrollToPosition([x, y], { behavior: 'instant' });
    if (Math.abs(scrollY - y) < 1 || performance.now() > until) restoring.abort();
    else requestAnimationFrame(step);
  };
  step();
  return restoring;
}

/**
 * Keeps a section link on its section while the page above it still grows – the home page's next events arrive from
 * the API after the jump and pushed Aliancia/Komunita down by a whole section. Only reacts when the page height
 * changes, so the smooth scroll itself is left alone. Gives up after 2.5 s, or as soon as the visitor scrolls or
 * clicks.
 */
function follow(scroller: ViewportScroller, doc: Document, anchor: string): AbortController {
  const following = new AbortController();
  const main = doc.querySelector('main');
  if (!main || typeof ResizeObserver === 'undefined') return following;
  for (const type of ['wheel', 'touchstart', 'keydown', 'pointerdown']) {
    addEventListener(type, () => following.abort(), { passive: true, signal: following.signal });
  }
  let height = main.offsetHeight;
  const observer = new ResizeObserver(() => {
    if (main.offsetHeight === height) return;
    height = main.offsetHeight;
    scroller.scrollToAnchor(anchor, { behavior: 'instant' });
  });
  observer.observe(main);
  const timer = setTimeout(() => following.abort(), 2500);
  following.signal.addEventListener('abort', () => {
    observer.disconnect();
    clearTimeout(timer);
  });
  return following;
}

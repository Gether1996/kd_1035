import { ViewportScroller } from '@angular/common';
import { ChangeDetectionStrategy, Component, DOCUMENT, afterNextRender, effect, inject } from '@angular/core';
import { NavigationEnd, NavigationStart, Router, RouterOutlet, Scroll } from '@angular/router';
import { Auth } from './core/auth';
import { I18n, parseUrl } from './core/i18n/i18n';
import { Seo } from './core/seo';
import { SiteUpdate } from './core/site-update';
import { Footer } from './layout/footer/footer';
import { Header } from './layout/header/header';
import { Icon } from './shared/icon';
import { ScrollFx } from './shared/scroll-fx';
import { TermsGate } from './shared/terms-gate';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Header, Footer, Icon, ScrollFx, TermsGate],
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
    <app-terms-gate />
    @if (update.available() && !update.dismissed()) {
      <div class="update-bar" role="status">
        <span>{{ i18n.t().update.text }}</span>
        <button type="button" class="pill-btn" (click)="update.reload()">{{ i18n.t().update.reload }}</button>
        <button type="button" class="update-bar__close" [attr.aria-label]="i18n.t().update.close" (click)="update.dismissed.set(true)">
          <svg appIcon="x"></svg>
        </button>
      </div>
    }
  `,
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly i18n = inject(I18n);
  protected readonly update = inject(SiteUpdate);

  constructor() {
    inject(Seo);
    const router = inject(Router);
    const doc = inject(DOCUMENT);
    const scroller = inject(ViewportScroller);

    // section links land below the fixed header
    const header = () => doc.querySelector('app-header')?.clientHeight ?? 0;
    scroller.setOffset(() => [0, header()]);

    // new page → top; same page in the other language → keep the scroll position;
    // back/forward → where the visitor left that page. The browser's own restoration would run while the previous
    // page is still rendered and stop at its height (forward from /o-nas to /#alliance landed above the section).
    scroller.setHistoryScrollRestoration('manual');
    let previous = parseUrl(router.url).rest;
    let changed = false;
    let popstate = false;
    let restoring: AbortController | undefined;
    // Back/forward to a section link (/#alliance) returns to the section, not to the saved position: a visitor who left
    // before the next events loaded above it saved a position a whole section short. Per history entry: how far below
    // the section's landing spot the visitor was when they left. The router writes the id of every navigation, back
    // and forward included, into the entry it lands on (history.state.navigationId), like it keys its own positions.
    const belowSection = new Map<number, number>();
    let current = 0; // the id of the navigation the visitor is on = the navigationId of its history entry
    let returning = 0; // the navigationId of the entry back/forward goes to
    router.events.subscribe((e) => {
      if (e instanceof NavigationStart) {
        popstate = e.navigationTrigger === 'popstate';
        returning = e.restoredState?.navigationId ?? 0;
        restoring?.abort();
        // router.url and the page are still the ones being left
        const fragment = router.parseUrl(router.url).fragment;
        const section = fragment ? doc.getElementById(fragment) : null;
        if (section) belowSection.set(current, Math.round(header() - section.getBoundingClientRect().top));
      } else if (e instanceof NavigationEnd) {
        current = e.id;
        const rest = parseUrl(e.urlAfterRedirects).rest;
        changed = rest !== previous;
        previous = rest;
        const anchor = e.urlAfterRedirects.includes('#');
        // the first navigation is the prerendered page itself – a visitor may have scrolled before the app started
        if (changed && !popstate && !anchor && e.id > 1) scroller.scrollToPosition([0, 0], { behavior: 'instant' });
        // a shared link straight to a section (/#alliance): the browser jumps there in the prerendered page and the
        // router sends no Scroll event for the first navigation, so the next events loading above it pushed it away
        const fragment = router.parseUrl(e.urlAfterRedirects).fragment;
        if (e.id === 1 && fragment) restoring = follow(scroller, doc, fragment);
      } else if (e instanceof Scroll && popstate) {
        // back to the section – unless the visitor had scrolled up above it (the next events would then come between
        // them); otherwise the position the router saved when the visitor left the page (after a reload it has none)
        const below = e.anchor ? belowSection.get(returning) : undefined;
        if (e.anchor && below !== undefined && below >= -1) {
          restoring = follow(scroller, doc, e.anchor, { below, position: e.position });
        } else if (e.position) {
          restoring = restore(scroller, doc, e.position);
        } else if (changed && !e.anchor) {
          scroller.scrollToPosition([0, 0], { behavior: 'instant' });
        }
      } else if (e instanceof Scroll && e.anchor) {
        // a section link (/#alliance): sections above it that load from the API afterwards would push it away
        restoring?.abort();
        restoring = follow(scroller, doc, e.anchor);
      }
    });

    afterNextRender(() => {
      // returning visitors get the language they chose last time (Czech browsers default to CZ);
      // a shared link keeps its query (/kalendar?event=12&on=… opens the event in CZ too)
      const preferred = this.i18n.preferred();
      if (preferred && preferred !== this.i18n.lang()) {
        const url = this.i18n.switchPath(preferred) + location.search + location.hash;
        router.navigateByUrl(url, { replaceUrl: true });
      }
    });

    // a signed-in player gets the language picked on /ucet (Gether 17. 10. 2026), once per visit (the language switch
    // still shows the other one). The browser remembers it like the switch, so the next visit starts in it at once
    // (above); this first time the page loads again in that language – a router navigation started while the page
    // still hydrates never finished
    const auth = inject(Auth);
    let followed = false;
    effect(() => {
      if (followed || !auth.ready()) return;
      followed = true;
      const lang = auth.user()?.lang;
      if (!lang) return;
      this.i18n.remember(lang);
      if (lang !== this.i18n.lang()) location.replace(this.i18n.switchPath(lang) + location.search + location.hash);
    });
  }
}

/**
 * How long restore() and follow() keep correcting the position while content from the API still arrives. Any scroll,
 * touch, key or click of the visitor ends it at once, so it never fights them; 2 s was too short on a slow phone
 * connection (the iPhone e2e run caught forward to /#alliance a whole section off).
 */
const SETTLE_MS = 5000;

/**
 * Scrolls to `position` once the page is tall enough for it – a guide's content arrives from the API a moment after
 * the page is shown – and keeps it there while the page still grows: content loading above it (the home page's next
 * events) made the browser's scroll anchoring keep the wrong part in view (forward to /#alliance landed a whole
 * section below it). Gives up after SETTLE_MS, or as soon as the visitor scrolls or clicks.
 */
function restore(scroller: ViewportScroller, doc: Document, [x, y]: [number, number]): AbortController {
  const restoring = new AbortController();
  const until = performance.now() + SETTLE_MS;
  for (const type of ['wheel', 'touchstart', 'keydown', 'pointerdown']) {
    addEventListener(type, () => restoring.abort(), { passive: true, signal: restoring.signal });
  }
  const step = () => {
    if (restoring.signal.aborted) return;
    scroller.scrollToPosition([x, y], { behavior: 'instant' });
    if (performance.now() > until) restoring.abort();
    else if (Math.abs(scrollY - y) >= 1) requestAnimationFrame(step);
  };
  const main = doc.querySelector('main');
  if (main && typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(step);
    observer.observe(main);
    const timer = setTimeout(() => restoring.abort(), SETTLE_MS);
    restoring.signal.addEventListener('abort', () => {
      observer.disconnect();
      clearTimeout(timer);
    });
  }
  step();
  return restoring;
}

/**
 * Keeps a section link on its section while the page above it still grows – the home page's next events arrive from
 * the API after the jump and pushed Aliancia/Komunita down by a whole section. Only reacts when the page height
 * changes, so the smooth scroll itself is left alone. Back/forward (`back` given) goes there at once instead,
 * `back.below` px past the section's landing spot like when the visitor left; until the section is there (the page is
 * still rendering, or its API failed) it keeps the position the router saved. Gives up after SETTLE_MS, or as soon as
 * the visitor scrolls or clicks.
 */
function follow(
  scroller: ViewportScroller,
  doc: Document,
  anchor: string,
  back?: { below: number; position: [number, number] | null },
): AbortController {
  const following = new AbortController();
  const go = () => {
    if (!back || doc.getElementById(anchor)) {
      scroller.scrollToAnchor(anchor, { behavior: 'instant' });
      if (back?.below) scroller.scrollToPosition([0, scrollY + back.below], { behavior: 'instant' });
    } else if (back.position) {
      scroller.scrollToPosition(back.position, { behavior: 'instant' });
    }
  };
  if (back) go();
  const main = doc.querySelector('main');
  if (!main || typeof ResizeObserver === 'undefined') return following;
  for (const type of ['wheel', 'touchstart', 'keydown', 'pointerdown']) {
    addEventListener(type, () => following.abort(), { passive: true, signal: following.signal });
  }
  let height = main.offsetHeight;
  const observer = new ResizeObserver(() => {
    if (main.offsetHeight === height) return;
    height = main.offsetHeight;
    go();
  });
  observer.observe(main);
  const timer = setTimeout(() => following.abort(), SETTLE_MS);
  following.signal.addEventListener('abort', () => {
    observer.disconnect();
    clearTimeout(timer);
  });
  return following;
}

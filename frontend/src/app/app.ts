import { ViewportScroller } from '@angular/common';
import { ChangeDetectionStrategy, Component, DOCUMENT, afterNextRender, inject } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { I18n, parseUrl } from './core/i18n/i18n';
import { Seo } from './core/seo';
import { Footer } from './layout/footer/footer';
import { Header } from './layout/header/header';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Header, Footer],
  template: `
    <a class="skip-link" href="#main">{{ i18n.t().nav.skip }}</a>
    <app-header />
    <main id="main" tabindex="-1">
      <router-outlet />
    </main>
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

    // new page → top; same page in the other language → keep the scroll position
    let previous = parseUrl(router.url).rest;
    router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)).subscribe((e) => {
      const rest = parseUrl(e.urlAfterRedirects).rest;
      if (rest !== previous && !e.urlAfterRedirects.includes('#')) scroller.scrollToPosition([0, 0]);
      previous = rest;
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

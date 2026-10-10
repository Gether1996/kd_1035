import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { DOCUMENT, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { I18n } from './core/i18n/i18n';
import { About } from './pages/about/about';
import { GuideHub } from './pages/guides/guide-hub';
import { GuideList } from './pages/guides/guide-list';
import { GuidePage } from './pages/guides/guide-page';
import { NotFound } from './pages/not-found/not-found';
import { Privacy } from './pages/privacy/privacy';
import { Terms } from './pages/terms/terms';

describe('routes', () => {
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    // the page header parallax and the scroll reveal need browser APIs that jsdom does not have
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    // admin content (links, guides) stays pending – not under test
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter(routes, withComponentInputBinding())],
    });
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => vi.unstubAllGlobals());

  const head = () => TestBed.inject(DOCUMENT).head;
  const el = () => harness.routeNativeElement as HTMLElement;

  it('shows the Slovak 404 page for an unknown address and keeps the address', async () => {
    await harness.navigateByUrl('/neexistuje', NotFound);
    expect(TestBed.inject(Router).url).toBe('/neexistuje');
    expect(TestBed.inject(I18n).lang()).toBe('sk');
    expect(el().querySelector('h1')?.textContent).toContain('Táto stránka neexistuje');
    const links = Array.from(el().querySelectorAll('app-not-found-links a'), (a) => a.getAttribute('href'));
    expect(links).toEqual(['/', '/navody']);
  });

  it('shows the Czech 404 page under /cz', async () => {
    await harness.navigateByUrl('/cz/neexistuje', NotFound);
    expect(TestBed.inject(Router).url).toBe('/cz/neexistuje');
    expect(TestBed.inject(I18n).lang()).toBe('cs');
    expect(el().querySelector('h1')?.textContent).toContain('Tato stránka neexistuje');
    const links = Array.from(el().querySelectorAll('app-not-found-links a'), (a) => a.getAttribute('href'));
    expect(links).toEqual(['/cz', '/cz/navody']);
  });

  it('keeps the 404 page out of search results until a real page opens', async () => {
    await harness.navigateByUrl('/neexistuje', NotFound);
    TestBed.tick();
    expect(head().querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex');
    expect(head().querySelector('link[rel="canonical"]')).toBeNull();
    expect(TestBed.inject(DOCUMENT).title).toBe('Táto stránka neexistuje | KD 1035');

    await harness.navigateByUrl('/cz/o-nas', About);
    TestBed.tick();
    expect(head().querySelector('meta[name="robots"]')).toBeNull();
    expect(head().querySelector('link[rel="canonical"]')?.getAttribute('href')).toMatch(/\/cz\/o-nas$/);
  });

  const real: [string, Type<unknown>][] = [
    ['/o-nas', About],
    ['/cz/o-nas', About],
    ['/cz/podmienky', Terms],
    ['/cz/ochrana-udajov', Privacy],
    ['/navody', GuideHub],
    ['/cz/navody', GuideHub],
    ['/navody/vybava', GuideList],
    ['/cz/navody/vybava', GuideList],
    ['/cz/navody/vybava/mge', GuidePage],
    // deeper than any page → 404, not a guide
    ['/cz/navody/vybava/mge/navyse', NotFound],
  ];
  for (const [url, page] of real) {
    it(`routes ${url} to its page`, async () => {
      await harness.navigateByUrl(url, page);
      expect(TestBed.inject(I18n).lang()).toBe(url.startsWith('/cz') ? 'cs' : 'sk');
    });
  }
});

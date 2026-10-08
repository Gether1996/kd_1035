import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { GuideList } from './guide-list';
import { GuidePage } from './guide-page';

describe('Missing guides', () => {
  beforeEach(() => {
    // the page header parallax and the scroll reveal need browser APIs that jsdom does not have
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        unobserve() {}
      },
    );
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  const head = () => TestBed.inject(DOCUMENT).head;
  const links = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('app-not-found-links a'), (a) => [a.getAttribute('href'), a.textContent?.trim()]);

  async function settle(fixture: { whenStable(): Promise<unknown> }) {
    // other admin content (links, the guide list) is not under test
    TestBed.inject(HttpTestingController)
      .match(() => true)
      .forEach((req) => req.flush([]));
    TestBed.tick();
    await fixture.whenStable();
  }

  it('keeps an unknown guide out of search results and offers a way home', async () => {
    const fixture = TestBed.createComponent(GuidePage);
    fixture.componentRef.setInput('category', 'vybava');
    fixture.componentRef.setInput('slug', 'neexistuje');
    fixture.detectChanges();
    TestBed.inject(HttpTestingController)
      .expectOne('/api/guides/neexistuje/')
      .flush('missing', { status: 404, statusText: 'Not Found' });
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.state')?.textContent).toContain('Tento návod neexistuje');
    expect(links(el)).toEqual([
      ['/', 'Domov'],
      ['/navody/commanderi', 'Návody'],
    ]);
    expect(head().querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex');
    expect(head().querySelector('link[rel="canonical"]')).toBeNull();
    expect(TestBed.inject(DOCUMENT).title).toBe('Táto stránka neexistuje | KD 1035');
  });

  it('keeps an unknown category out of search results and offers a way home', async () => {
    const fixture = TestBed.createComponent(GuideList);
    fixture.componentRef.setInput('category', 'neexistuje');
    fixture.detectChanges();
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.state')?.textContent).toContain('Tento návod neexistuje');
    expect(links(el).map(([href]) => href)).toEqual(['/', '/navody/commanderi']);
    expect(head().querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex');
    expect(head().querySelector('link[rel="canonical"]')).toBeNull();
  });

  it('lets a real category be indexed', async () => {
    const fixture = TestBed.createComponent(GuideList);
    fixture.componentRef.setInput('category', 'vybava');
    fixture.detectChanges();
    await settle(fixture);

    expect((fixture.nativeElement as HTMLElement).querySelector('app-not-found-links')).toBeNull();
    expect(head().querySelector('meta[name="robots"]')).toBeNull();
    expect(head().querySelector('link[rel="canonical"]')).not.toBeNull();
  });
});

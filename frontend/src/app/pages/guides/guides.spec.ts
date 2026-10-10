import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { GuideHub } from './guide-hub';
import { GuideList } from './guide-list';
import { GuidePage } from './guide-page';

describe('Guide pages', () => {
  beforeEach(() => {
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
      ['/navody', 'Návody'],
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
    expect(links(el).map(([href]) => href)).toEqual(['/', '/navody']);
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

  const summary = (slug: string, category: string) => ({
    slug,
    category,
    specialty: '',
    specialty_icon: null,
    title_sk: slug,
    title_cs: '',
    excerpt_sk: '',
    excerpt_cs: '',
    updated_at: '2026-10-08T12:00:00Z',
  });
  const breadcrumbs = () => {
    const ld = JSON.parse(head().querySelector('script[type="application/ld+json"]')?.textContent ?? '{}');
    const list = ld['@graph'].find((node: { '@type': string }) => node['@type'] === 'BreadcrumbList');
    return list.itemListElement.map((item: { name: string; item: string }) => [item.name, new URL(item.item).pathname]);
  };

  describe('hub /navody', () => {
    async function open(answer: (req: ReturnType<HttpTestingController['expectOne']>) => void) {
      const fixture = TestBed.createComponent(GuideHub);
      fixture.detectChanges();
      answer(TestBed.inject(HttpTestingController).expectOne('/api/guides/'));
      await settle(fixture);
      return fixture.nativeElement as HTMLElement;
    }

    it('lists every guide under its category with a link to the whole category', async () => {
      const el = await open((req) =>
        req.flush([
          summary('mge', 'eventy'),
          summary('pary-pre-jazdu', 'commanderi'),
          summary('pary-pre-rally', 'commanderi'),
        ]),
      );
      const groups = [...el.querySelectorAll('.group')].map((group) => [
        group.querySelector('h2')?.textContent?.trim(),
        group.querySelector('.group__all')?.getAttribute('href'),
        [...group.querySelectorAll('a.row')].map((a) => a.getAttribute('href')),
      ]);
      // fixed category order, a category without guides is left out
      expect(groups).toEqual([
        ['Commanderi', '/navody/commanderi', ['/navody/commanderi/pary-pre-jazdu', '/navody/commanderi/pary-pre-rally']],
        ['Eventy', '/navody/eventy', ['/navody/eventy/mge']],
      ]);
      expect(TestBed.inject(DOCUMENT).title).toBe('Návody pre Rise of Kingdoms · KD 1035 CZ/SK');
      expect(breadcrumbs()).toEqual([
        ['Domov', '/'],
        ['Návody', '/navody'],
      ]);
    });

    it('shows the error text when the API fails', async () => {
      const el = await open((req) => req.flush('down', { status: 502, statusText: 'Bad Gateway' }));
      expect(el.querySelector('.state')?.textContent).toContain('Návody sa nepodarilo načítať');
      expect(el.querySelector('.group')).toBeNull();
    });

    it('loads the commander finder when it scrolls into view, or at once for a link with ?commander=', async () => {
      const el = await open((req) => req.flush([]));
      // jsdom never reports the viewport (no IntersectionObserver callbacks): only the placeholder
      expect(el.querySelector('app-commander-finder')).toBeNull();
      expect(el.querySelector('.finder-placeholder')).not.toBeNull();

      const shared = TestBed.createComponent(GuideHub);
      shared.componentRef.setInput('commander', 'attila');
      // the block's chunk is imported asynchronously
      await vi.waitFor(() => {
        shared.detectChanges();
        expect(shared.nativeElement.querySelector('app-commander-finder')).not.toBeNull();
      });
      TestBed.tick();
      TestBed.inject(HttpTestingController).expectOne('/api/commanders/').flush([]);
    });
  });

  it('puts the hub between home and the category in the breadcrumbs', async () => {
    const fixture = TestBed.createComponent(GuideList);
    fixture.componentRef.setInput('category', 'vybava');
    fixture.detectChanges();
    await settle(fixture);

    const crumbs = (fixture.nativeElement as HTMLElement).querySelectorAll('app-breadcrumbs a');
    expect(Array.from(crumbs, (a) => a.getAttribute('href'))).toEqual(['/', '/navody']);
    expect(breadcrumbs()).toEqual([
      ['Domov', '/'],
      ['Návody', '/navody'],
      ['Výbava', '/navody/vybava'],
    ]);
  });

  it('marks a guide about one commander specialty with its in-game tag', async () => {
    const fixture = TestBed.createComponent(GuideList);
    fixture.componentRef.setInput('category', 'commanderi');
    fixture.detectChanges();
    const guide = (slug: string, specialty: string) => ({
      slug,
      specialty,
      specialty_icon: specialty ? `/static/guides/specialties/${specialty}.webp` : null,
      category: 'commanderi',
      title_sk: slug,
      title_cs: '',
      excerpt_sk: '',
      excerpt_cs: '',
      updated_at: '2026-10-08T12:00:00Z',
    });
    TestBed.inject(HttpTestingController)
      .expectOne('/api/guides/')
      .flush([guide('pary-pre-jazdu', 'cavalry'), guide('pary-pre-rally', 'conquering'), guide('pary-pre-f2p', '')]);
    await settle(fixture);

    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('.row');
    const icon = (row: Element) => row.querySelector('img.row__specialty')?.getAttribute('src') ?? null;
    expect(Array.from(rows, icon)).toEqual([
      '/static/guides/specialties/cavalry.webp',
      '/static/guides/specialties/conquering.webp',
      null,
    ]);
    // decorative: the title already names the specialty
    expect(rows[0].querySelector('img.row__specialty')?.getAttribute('alt')).toBe('');
  });

  describe('end of a guide', () => {
    const detail = {
      ...summary('pary-pre-jazdu', 'commanderi'),
      specialty: 'cavalry',
      title_sk: 'Páry pre jazdu',
      html_sk: '<p>Úvod.</p>',
      html_cs: '',
    };
    const listed = (slug: string, category: string, specialty = '') => ({
      ...summary(slug, category),
      specialty,
      specialty_icon: specialty ? `/static/guides/specialties/${specialty}.webp` : null,
    });

    async function open(list: (req: ReturnType<HttpTestingController['expectOne']>) => void) {
      const fixture = TestBed.createComponent(GuidePage);
      fixture.componentRef.setInput('category', 'commanderi');
      fixture.componentRef.setInput('slug', 'pary-pre-jazdu');
      fixture.detectChanges();
      const http = TestBed.inject(HttpTestingController);
      http.expectOne('/api/guides/pary-pre-jazdu/').flush(detail);
      list(http.expectOne('/api/guides/'));
      await settle(fixture);
      return fixture;
    }

    it('links up to three related guides, the same specialty first and never the guide itself', async () => {
      const fixture = await open((req) =>
        req.flush([
          listed('ako-skladat-pary-commanderov', 'commanderi'),
          listed('pary-pre-jazdu', 'commanderi', 'cavalry'),
          listed('pary-pre-pechotu', 'commanderi', 'infantry'),
          listed('pary-pre-rally', 'commanderi', 'conquering'),
          listed('mge', 'eventy'),
          listed('vybava-pre-jazdu', 'vybava', 'cavalry'),
        ]),
      );
      const el = fixture.nativeElement as HTMLElement;
      const related = el.querySelector('.related');
      expect(related?.querySelector('h2')?.textContent).toContain('Súvisiace návody');
      const rows = [...(related?.querySelectorAll('a.row') ?? [])];
      expect(rows.map((a) => a.getAttribute('href'))).toEqual([
        '/navody/vybava/vybava-pre-jazdu',
        '/navody/commanderi/ako-skladat-pary-commanderov',
        '/navody/commanderi/pary-pre-pechotu',
      ]);
      expect(rows[0].querySelector('.row__eyebrow')?.textContent).toContain('Výbava');
      expect(rows[0].querySelector('img.row__specialty')?.getAttribute('src')).toBe(
        '/static/guides/specialties/cavalry.webp',
      );
    });

    it('still shows the guide without the related block when the list fails', async () => {
      const fixture = await open((req) => req.flush('down', { status: 502, statusText: 'Bad Gateway' }));
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.prose')?.textContent).toContain('Úvod.');
      expect(el.querySelector('.related')).toBeNull();
      expect(el.querySelector('.guide-foot .back')).not.toBeNull();
    });

    it('copies the link of the page in its language and announces it', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal('navigator', { clipboard: { writeText } });
      const fixture = await open((req) => req.flush([]));
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.related')).toBeNull();

      const button = el.querySelector<HTMLButtonElement>('.guide-actions button')!;
      expect(button.textContent).toContain('Kopírovať odkaz');
      button.click();
      expect(writeText).toHaveBeenCalledWith(`${location.origin}/navody/commanderi/pary-pre-jazdu`);
      await fixture.whenStable();
      expect(el.querySelector('[role="status"]')?.textContent).toContain('Odkaz skopírovaný');
      expect(el.querySelector('.manual-link')).toBeNull();
    });

    it('shows the link to copy by hand without clipboard and share sheet', async () => {
      vi.stubGlobal('navigator', {});
      const fixture = await open((req) => req.flush([]));
      const el = fixture.nativeElement as HTMLElement;

      el.querySelector<HTMLButtonElement>('.guide-actions button')!.click();
      await fixture.whenStable();
      const input = el.querySelector<HTMLInputElement>('.manual-link input');
      expect(input?.value).toBe(`${location.origin}/navody/commanderi/pary-pre-jazdu`);
      expect(input?.readOnly).toBe(true);
      expect(el.querySelector('[role="status"]')?.textContent?.trim()).toBe('');
    });
  });

  describe('next runs of the linked events', () => {
    const guide = (events?: unknown[]) => ({
      slug: 'mge',
      category: 'eventy',
      specialty: '',
      specialty_icon: null,
      title_sk: 'Mightiest Governor (MGE)',
      title_cs: '',
      excerpt_sk: 'Úvod.',
      excerpt_cs: '',
      updated_at: '2026-10-08T12:00:00Z',
      html_sk: '<p>Úvod.</p>',
      html_cs: '',
      ...(events ? { events } : {}),
    });
    const event = (id: number, name: string, start: string | null, end: string | null, irregular = false) => ({
      id,
      name_sk: name,
      name_cs: '',
      icon: null,
      start,
      end,
      irregular,
      repeat_days: irregular ? 0 : 56,
    });

    beforeEach(() => vi.useFakeTimers({ now: new Date('2026-10-30T12:00:00Z'), toFake: ['Date'] }));
    afterEach(() => vi.useRealTimers());

    async function open(body: object) {
      const fixture = TestBed.createComponent(GuidePage);
      fixture.componentRef.setInput('category', 'eventy');
      fixture.componentRef.setInput('slug', 'mge');
      fixture.detectChanges();
      TestBed.inject(HttpTestingController).expectOne('/api/guides/mge/').flush(body);
      await settle(fixture);
      return fixture.nativeElement as HTMLElement;
    }

    it('shows the running and next runs with a link to their dialog in the calendar', async () => {
      const el = await open(
        guide([
          event(2, 'MGE – Jazda', '2026-10-26T00:00:00Z', '2026-11-01T00:00:00Z'),
          event(9, 'MGE – Pechota', '2026-12-21T00:00:00Z', '2026-12-27T00:00:00Z'),
          event(11, 'Silk Road', '2026-10-31T18:00:00Z', '2026-10-31T19:00:00Z', true),
          event(12, 'Shadow Legion', null, null, true),
        ]),
      );
      const card = el.querySelector('app-guide-events');
      expect(card?.querySelector('h2')?.textContent).toContain('V kalendári');
      // above the article
      expect(card?.nextElementSibling?.classList).toContain('prose');

      const rows = [...el.querySelectorAll('.event')];
      const text = (row: Element, selector: string) =>
        row.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();
      expect(rows.map((row) => text(row, '.event__name'))).toEqual([
        'MGE – Jazda',
        'MGE – Pechota',
        'Silk Road',
        'Shadow Legion',
      ]);
      expect(text(rows[0], '.event__live')).toBe('Prebieha');
      expect(rows[1].querySelector('.event__live')).toBeNull();
      // a game event shows its days, a short irregular one its time in UTC as well
      expect(text(rows[1], '.event__when')).not.toContain('UTC');
      expect(text(rows[2], '.event__when')).toContain('UTC 18:00');
      expect(text(rows[3], '.event__when')).toBe('Ďalší termín oznámime');

      const hrefs = rows.map((row) => row.querySelector('a.event__remind')?.getAttribute('href'));
      expect(hrefs).toEqual([
        '/kalendar?event=2&on=2026-10-30',
        '/kalendar?event=9&on=2026-12-21',
        '/kalendar?event=11&on=2026-10-31',
        '/kalendar?event=12',
      ]);
      expect(rows[0].querySelector('a.event__remind')?.getAttribute('aria-label')).toBe('Pripomenúť: MGE – Jazda');
    });

    it('shows no card without linked events', async () => {
      expect((await open(guide([]))).querySelector('app-guide-events')).toBeNull();
    });

    it('shows no card when the API does not send events at all', async () => {
      const el = await open(guide());
      expect(el.querySelector('.prose')?.textContent).toContain('Úvod.');
      expect(el.querySelector('app-guide-events')).toBeNull();
    });
  });
});

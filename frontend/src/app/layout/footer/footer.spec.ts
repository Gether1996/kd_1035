import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SITE_VERSION } from '../../core/version';
import { Footer } from './footer';

describe('Footer', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
  });

  async function render(status: (http: HttpTestingController) => void) {
    const fixture = TestBed.createComponent(Footer);
    const http = TestBed.inject(HttpTestingController);
    TestBed.tick();
    status(http);
    // other admin content (alliances, links) is not under test
    http.match(() => true).forEach((req) => req.flush([]));
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows when the information was last updated', async () => {
    const el = await render((http) =>
      http.expectOne('/api/status/').flush({ updated: '2026-10-07', meta_verified: '2026-10-07' }),
    );
    const time = el.querySelector('.footer__updated time');
    expect(time?.getAttribute('datetime')).toBe('2026-10-07');
    expect(time?.textContent).toContain('2026');
  });

  it('says the site is unofficial and links to the terms of use and the privacy page', async () => {
    const el = await render((http) =>
      http.expectOne('/api/status/').flush('down', { status: 500, statusText: 'Server Error' }),
    );
    expect(el.querySelector('.footer__note')?.textContent).toContain('Lilith Games');
    const links = Array.from(el.querySelectorAll('.footer__links a'), (a) => [
      a.getAttribute('href'),
      a.textContent?.trim(),
    ]);
    expect(links).toEqual([
      ['/podmienky', 'Podmienky používania'],
      ['/ochrana-udajov', 'Ochrana údajov'],
    ]);
  });

  it('hides the line when the API fails', async () => {
    const el = await render((http) =>
      http.expectOne('/api/status/').flush('down', { status: 500, statusText: 'Server Error' }),
    );
    expect(el.querySelector('.footer__updated')).toBeNull();
  });

  it('shows the version of the website after the legal links', async () => {
    const el = await render(() => undefined);
    const version = el.querySelector('.footer__links .footer__version');
    expect(version?.textContent?.trim()).toBe(`Verzia webu v${SITE_VERSION}`);
    expect(SITE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

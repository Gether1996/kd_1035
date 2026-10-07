import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
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

  it('hides the line when the API fails', async () => {
    const el = await render((http) =>
      http.expectOne('/api/status/').flush('down', { status: 500, statusText: 'Server Error' }),
    );
    expect(el.querySelector('.footer__updated')).toBeNull();
  });
});

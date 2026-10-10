import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Community } from './community';

describe('Community (home)', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', () => ({ matches: true })); // reduced motion: no scroll effects
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        unobserve() {}
      },
    );
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([{ path: '**', children: [] }])],
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ['/', '/o-nas#migracia', 'Ako prebieha migrácia'],
    ['/cz', '/cz/o-nas#migracia', 'Jak probíhá migrace'],
  ])('links %s to the migration steps on the about page', async (url, href, text) => {
    await TestBed.inject(Router).navigateByUrl(url);
    const fixture = TestBed.createComponent(Community);
    fixture.detectChanges();
    TestBed.tick(); // the API requests start in an effect
    TestBed.inject(HttpTestingController)
      .match(() => true)
      .forEach((req) => req.flush([]));
    await fixture.whenStable();
    const link = (fixture.nativeElement as HTMLElement).querySelector('.more__link');
    expect(link?.getAttribute('href')).toBe(href);
    expect(link?.textContent?.trim()).toBe(text);
  });
});

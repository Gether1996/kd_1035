import { DOCUMENT } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Seo } from './seo';

describe('Seo', () => {
  let seo: Seo;
  const head = () => TestBed.inject(DOCUMENT).head;
  const robots = () => head().querySelector('meta[name="robots"]');
  const canonical = () => head().querySelector('link[rel="canonical"]');
  const hreflangs = () =>
    Array.from(head().querySelectorAll('link[rel="alternate"][hreflang]'), (el) => el.getAttribute('hreflang'));

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([{ path: '**', children: [] }])],
    });
    seo = TestBed.inject(Seo);
  });

  it('adds robots noindex for private pages and removes it again', () => {
    TestBed.tick();
    expect(robots()).toBeNull();

    seo.set({ title: 'Môj účet | KD 1035', description: 'x', noindex: true });
    TestBed.tick();
    expect(robots()?.getAttribute('content')).toBe('noindex');
    expect(TestBed.inject(DOCUMENT).title).toBe('Môj účet | KD 1035');

    seo.set(null);
    TestBed.tick();
    expect(robots()).toBeNull();
  });

  it('drops canonical and hreflang links on a noindex page and brings them back on the next page', () => {
    TestBed.tick();
    expect(canonical()).not.toBeNull();
    expect(hreflangs()).toEqual(['sk', 'cs', 'x-default']);

    seo.set({ title: 'Táto stránka neexistuje | KD 1035', description: 'x', noindex: true });
    TestBed.tick();
    expect(robots()?.getAttribute('content')).toBe('noindex');
    expect(canonical()).toBeNull();
    expect(hreflangs()).toEqual([]);

    seo.set(null);
    TestBed.tick();
    expect(robots()).toBeNull();
    expect(canonical()?.getAttribute('href')).toMatch(/\/$/);
    expect(hreflangs()).toEqual(['sk', 'cs', 'x-default']);
  });

  it('keeps the query of a shared link out of canonical and hreflang', async () => {
    await TestBed.inject(Router).navigateByUrl('/kalendar?event=5&on=2026-10-14#top');
    TestBed.tick();
    const hrefs = Array.from(
      head().querySelectorAll('link[rel="canonical"], link[rel="alternate"][hreflang]'),
      (el) => el.getAttribute('href'),
    );
    expect(hrefs.length).toBe(4);
    for (const href of hrefs) expect(href).toMatch(/\/(cz\/)?kalendar$/);
    expect(head().querySelector('meta[property="og:url"]')?.getAttribute('content')).toMatch(/\/kalendar$/);
  });
});

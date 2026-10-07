import { DOCUMENT } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Seo } from './seo';

describe('Seo', () => {
  it('adds robots noindex for private pages and removes it again', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const seo = TestBed.inject(Seo);
    const robots = () => TestBed.inject(DOCUMENT).head.querySelector('meta[name="robots"]');

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
});

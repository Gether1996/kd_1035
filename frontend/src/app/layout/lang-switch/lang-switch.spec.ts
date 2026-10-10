import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { LangSwitch } from './lang-switch';

describe('LangSwitch', () => {
  let fixture: ComponentFixture<LangSwitch>;

  const href = (lang: string) =>
    (fixture.nativeElement as HTMLElement).querySelector(`a[hreflang="${lang}"]`)?.getAttribute('href');

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: '**', children: [] }])] });
    fixture = TestBed.createComponent(LangSwitch);
  });

  it('keeps the query and the section of a shared link after a navigation', async () => {
    await TestBed.inject(Router).navigateByUrl('/kalendar?event=5&on=2026-10-14#top');
    await fixture.whenStable();
    expect(href('cs')).toBe('/cz/kalendar?event=5&on=2026-10-14#top');
    expect(href('sk')).toBe('/kalendar?event=5&on=2026-10-14#top');

    await TestBed.inject(Router).navigateByUrl('/cz/navody?commander=attila');
    await fixture.whenStable();
    expect(href('sk')).toBe('/navody?commander=attila');
    expect(href('cs')).toBe('/cz/navody?commander=attila');
  });

  it('links the plain page when there is no query', async () => {
    await TestBed.inject(Router).navigateByUrl('/o-nas');
    await fixture.whenStable();
    expect(href('cs')).toBe('/cz/o-nas');
  });
});

import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { routes } from '../../app.routes';
import { Scroll } from '../../core/scroll';
import { Glossary } from './glossary';
import { TERMS } from './terms';

describe('Glossary', () => {
  it('has every term in both languages, with unique anchors', () => {
    const ids = TERMS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const term of TERMS) {
      expect(term.sk.trim(), term.id).not.toBe('');
      expect(term.cs.trim(), term.id).not.toBe('');
      expect(term.id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  async function render(url: string) {
    TestBed.configureTestingModule({ providers: [
        provideRouter(routes),
        { provide: Scroll, useValue: { scrolled: signal(false), reducedMotion: true } },
      ], });
    await TestBed.inject(Router).navigateByUrl(url);
    const fixture = TestBed.createComponent(Glossary);
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('lists the terms by group and filters them without diacritics', async () => {
    const { fixture, el } = await render('/slovnik');
    expect(el.querySelectorAll('.term').length).toBe(TERMS.length);
    expect(el.querySelector('#kvk dt')?.textContent).toContain('Kingdom versus Kingdom');

    const input = el.querySelector<HTMLInputElement>('#glossary-search')!;
    input.value = 'TAZKO'; // case and diacritics do not matter
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(Array.from(el.querySelectorAll('.term'), (t) => t.id)).toEqual(['deads']);

    input.value = 'tezce'; // the Czech text does not count on the Slovak page
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(el.querySelector('.empty')).not.toBeNull();
  });

  it('speaks Czech under /cz', async () => {
    const { fixture, el } = await render('/cz/slovnik');
    const input = el.querySelector<HTMLInputElement>('#glossary-search')!;
    input.value = 'těžce';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(Array.from(el.querySelectorAll('.term'), (t) => t.id)).toEqual(['deads']);
    expect(el.textContent).toContain('Slovník pojmů');
    expect(el.textContent).not.toContain('Migrácia');
  });
});

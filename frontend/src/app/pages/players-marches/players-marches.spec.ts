import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Auth } from '../../core/auth';
import { Scroll } from '../../core/scroll';
import { PlayersMarches } from './players-marches';

const MARCH = {
  id: 1,
  position: 1,
  kind: 'cavalry' as const,
  primary: 'Attila',
  secondary: 'Takeda Shingen',
  images: [{ id: 7, kind: 'equipment' as const, url: '/api/marches/images/7/', thumb: '/api/marches/images/7/?thumb=1', width: 1, height: 1 }],
};

// Seo and the page header keep tasks pending – render by hand instead of whenStable()
const tick = async (fixture: { detectChanges(): void }) => {
  await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
};

describe('PlayersMarches', () => {
  it('lists the public marches with portraits, filters by name and opens a screenshot', async () => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Scroll, useValue: { scrolled: signal(false), reducedMotion: true, onFrame: () => () => {} } },
        {
          provide: Auth,
          useValue: {
            ready: signal(true),
            failed: signal(false),
            enabled: signal(true),
            user: signal({ name: 'Nelly' }),
            loginUrl: () => '/api/auth/discord/login/',
          },
        },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(PlayersMarches);
    fixture.detectChanges();
    http.expectOne('/api/marches/').flush({
      reviewer: false,
      players: [
        { id: 1, name: 'nelly', ingame_name: 'Nelly', avatar_url: '', public: true, me: true, marches: [MARCH] },
        { id: 2, name: 'bob', ingame_name: '', avatar_url: '', public: true, me: false, marches: [MARCH] },
      ],
    });
    http.expectOne('/api/commanders/marches/').flush([{ name: 'Attila', icon: '/static/guides/commanders/attila.webp', pick: true }]);
    await tick(fixture);
    const el = fixture.nativeElement as HTMLElement;
    expect(Array.from(el.querySelectorAll('.player__name'), (n) => n.textContent)).toEqual(['Nelly', 'bob']);
    expect(el.querySelector('.tag')?.textContent).toContain('Ty');
    // closed at first: the count and the leading commanders; a click on the head opens the marches
    expect(el.querySelector('.mrow')).toBeNull();
    expect(el.querySelector('.player__count')?.textContent).toBe('1 march');
    const heads = () => [...el.querySelectorAll<HTMLButtonElement>('.player__head')];
    expect(heads()[0].getAttribute('aria-expanded')).toBe('false');
    heads()[0].click();
    await tick(fixture);
    expect(heads()[0].getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelectorAll('.player__marches').length).toBe(1);
    // "Rozbaliť všetky" opens the rest, then it closes them all
    const all = el.querySelector<HTMLButtonElement>('.bar .pill-btn')!;
    expect(all.textContent?.trim()).toBe('Rozbaliť všetky');
    all.click();
    await tick(fixture);
    expect(el.querySelectorAll('.player__marches').length).toBe(2);
    expect(all.textContent?.trim()).toBe('Zbaliť všetky');
    // only the heads, the name in alt and title
    const head = el.querySelector('.mrow__head')!;
    expect(head.getAttribute('src')).toBe('/static/guides/commanders/attila.webp');
    expect(head.getAttribute('title')).toBe('Attila');

    const search = el.querySelector<HTMLInputElement>('#marches-search')!;
    search.value = 'BOB';
    search.dispatchEvent(new Event('input'));
    await tick(fixture);
    expect(Array.from(el.querySelectorAll('.player__name'), (n) => n.textContent)).toEqual(['bob']);

    // three tabs: the players' marches, the player's own and their overview with the builds
    expect(Array.from(el.querySelectorAll('.tabs button'), (b) => b.textContent?.trim())).toEqual([
      'Marche hráčov',
      'Moje marche',
      'Prehľad marchov',
    ]);

    el.querySelector<HTMLButtonElement>('.mrow__shot')!.click();
    await tick(fixture);
    expect(el.querySelector('dialog[open] .viewer__img')?.getAttribute('src')).toBe('/api/marches/images/7/');
    http.match(() => true).forEach((r) => r.flush({}));
  });
});

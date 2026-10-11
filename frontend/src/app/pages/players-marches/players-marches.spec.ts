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
    expect(el.querySelector('.row__commander img')?.getAttribute('src')).toBe('/static/guides/commanders/attila.webp');

    const search = el.querySelector<HTMLInputElement>('#marches-search')!;
    search.value = 'BOB';
    search.dispatchEvent(new Event('input'));
    await tick(fixture);
    expect(Array.from(el.querySelectorAll('.player__name'), (n) => n.textContent)).toEqual(['bob']);

    // two tabs: the players' marches and the player's own
    expect(Array.from(el.querySelectorAll('.tabs button'), (b) => b.textContent?.trim())).toEqual(['Marche hráčov', 'Moje marche']);

    el.querySelector<HTMLButtonElement>('.row__shot')!.click();
    await tick(fixture);
    expect(el.querySelector('.viewer-image')?.getAttribute('src')).toBe('/api/marches/images/7/');
    http.match(() => true).forEach((r) => r.flush({}));
  });
});

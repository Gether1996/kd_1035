import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ARMORY } from '../../core/armory-testing';
import { Auth } from '../../core/auth';
import { Scroll } from '../../core/scroll';
import { PlayersMarches } from './players-marches';

const MARCH = {
  id: 1,
  position: 1,
  kind: 'cavalry' as const,
  primary: 'Attila',
  secondary: 'Takeda Shingen',
  gear: { weapon: { item: 'sacred-dominion', crit: true, iconic: 2 } },
  formation: 'delta',
  inscriptions: ['delta-scroll-thrasher'],
};

// Seo and the page header keep tasks pending – render by hand instead of whenStable()
const tick = async (fixture: { detectChanges(): void }) => {
  await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
};

describe('PlayersMarches', () => {
  it('lists the public marches as cards with their equipment and filters by name', async () => {
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
    // each march as a card with its equipment and armaments
    http.expectOne('/api/armory/').flush(ARMORY);
    await tick(fixture);
    expect(el.querySelector('.mb__face')?.getAttribute('src')).toBe('/static/guides/commanders/attila.webp');
    expect(el.querySelector('.mb__primary')?.textContent?.trim()).toBe('Attila');
    expect(el.querySelector('.gear__icon')?.getAttribute('src')).toBe('/static/guides/gear/sacred-dominion.webp');
    expect(el.querySelector('.mb__formation img')?.getAttribute('alt')).toBe('Delta');
    expect(el.querySelector('.mb__inscs .insc')?.textContent?.trim()).toBe('Thrasher');

    const search = el.querySelector<HTMLInputElement>('#marches-search')!;
    search.value = 'BOB';
    search.dispatchEvent(new Event('input'));
    await tick(fixture);
    expect(Array.from(el.querySelectorAll('.player__name'), (n) => n.textContent)).toEqual(['bob']);

    // two tabs: the players' marches and the player's own ("Moje marche" merged into the overview)
    expect(Array.from(el.querySelectorAll('.tabs button'), (b) => b.textContent?.trim())).toEqual(['Marche hráčov', 'Prehľad marchov']);
    http.match(() => true).forEach((r) => r.flush({}));
  });
});

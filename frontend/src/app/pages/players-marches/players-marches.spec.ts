import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
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

function setup(user: object) {
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
          user: signal(user),
          loginUrl: () => '/api/auth/discord/login/',
          reload: () => {},
        },
      },
    ],
  });
  return TestBed.inject(HttpTestingController);
}

describe('PlayersMarches', () => {
  it('lists the public marches as cards with their equipment, sorts and filters them', async () => {
    const http = setup({ name: 'Nelly', approved: true });
    const fixture = TestBed.createComponent(PlayersMarches);
    fixture.detectChanges();
    http.expectOne('/api/marches/').flush({
      reviewer: false,
      players: [
        {
          id: 1,
          name: 'nelly',
          ingame_name: 'Nelly',
          avatar_url: '',
          public: true,
          approved: true,
          me: true,
          marches: [MARCH, { ...MARCH, id: 3, position: 2, kind: 'archer' }],
          updated_at: '2026-10-10T12:00:00Z',
        },
        { id: 2, name: 'bob', ingame_name: '', avatar_url: '', public: true, approved: true, me: false, marches: [MARCH], updated_at: '2026-10-12T12:00:00Z' },
      ],
    });
    http.expectOne('/api/commanders/marches/').flush([{ name: 'Attila', icon: '/static/guides/commanders/attila.webp', pick: true }]);
    await tick(fixture);
    const el = fixture.nativeElement as HTMLElement;
    const names = () => Array.from(el.querySelectorAll('.player__name'), (n) => n.textContent);
    // the most recently changed first, with the date in the head
    expect(names()).toEqual(['bob', 'Nelly']);
    expect(el.querySelector('.player__discord')?.textContent?.trim()).toBe('upravené 12. 10. 14:00');
    expect(el.querySelectorAll('.player__discord')[1].textContent?.trim()).toBe('nelly · upravené 10. 10. 14:00');
    expect(el.querySelector('.tag')?.textContent).toContain('Ty');
    const sort = el.querySelector<HTMLSelectElement>('#marches-sort')!;
    sort.value = 'count';
    sort.dispatchEvent(new Event('change'));
    await tick(fixture);
    expect(names()).toEqual(['Nelly', 'bob']);
    const kind = el.querySelector<HTMLSelectElement>('#marches-kind')!;
    kind.value = 'archer';
    kind.dispatchEvent(new Event('change'));
    await tick(fixture);
    expect(names()).toEqual(['Nelly']);
    kind.value = '';
    kind.dispatchEvent(new Event('change'));
    sort.value = 'updated';
    sort.dispatchEvent(new Event('change'));
    await tick(fixture);
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

  it('filters by commander – with the type it is one march – opens the matches once and keeps ?cmd= in the address', async () => {
    const http = setup({ name: 'Nelly', approved: true });
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/?cmd=Attila');
    const fixture = TestBed.createComponent(PlayersMarches);
    // the router gives the page ?cmd= as an input
    fixture.componentRef.setInput('cmd', 'Attila');
    fixture.detectChanges();
    const march = (id: number, kind: string, primary: string, secondary: string) => ({ ...MARCH, id, position: id, kind, primary, secondary });
    const player = (id: number, name: string, updated_at: string, marches: object[]) =>
      ({ id, name, ingame_name: '', avatar_url: '', public: true, approved: true, me: false, marches, updated_at });
    http.expectOne('/api/marches/').flush({
      reviewer: false,
      players: [
        player(1, 'nelly', '2026-10-10T12:00:00Z', [march(1, 'cavalry', 'Attila', 'Takeda Shingen'), march(2, 'archer', 'Yi Seong-Gye', 'Kusunoki Masashige')]),
        player(2, 'bob', '2026-10-12T12:00:00Z', [march(3, 'cavalry', 'Attila', 'Takeda Shingen')]),
        // Attila only as the secondary of an archer march, the cavalry march without him
        player(3, 'cara', '2026-10-11T12:00:00Z', [march(4, 'archer', 'Yi Seong-Gye', 'Attila'), march(5, 'cavalry', 'Cao Cao', 'Minamoto no Yoshitsune')]),
        player(4, 'dan', '2026-10-09T12:00:00Z', [march(6, 'infantry', 'Gorgo', 'Constantine I')]),
      ],
    });
    http.match('/api/commanders/marches/').forEach((r) => r.flush([]));
    await tick(fixture);
    await tick(fixture);
    const el = fixture.nativeElement as HTMLElement;
    const names = () => Array.from(el.querySelectorAll('.player__name'), (n) => n.textContent);
    const opened = () => Array.from(el.querySelectorAll('.player.is-open .player__name'), (n) => n.textContent);
    const select = el.querySelector<HTMLSelectElement>('#marches-commander')!;
    // the commanders of the loaded marches only, the one from the address chosen
    expect([...select.options].map((o) => o.textContent)).toEqual([
      'Všetci commanderi',
      'Attila',
      'Cao Cao',
      'Constantine I',
      'Gorgo',
      'Kusunoki Masashige',
      'Minamoto no Yoshitsune',
      'Takeda Shingen',
      'Yi Seong-Gye',
    ]);
    expect(select.value).toBe('Attila');
    // primary or secondary; the matching players open
    expect(names()).toEqual(['bob', 'cara', 'nelly']);
    expect(opened()).toEqual(['bob', 'cara', 'nelly']);

    // with the type it is one and the same march: cara's cavalry has no Attila, nelly's archers neither
    const kind = el.querySelector<HTMLSelectElement>('#marches-kind')!;
    kind.value = 'cavalry';
    kind.dispatchEvent(new Event('change'));
    await tick(fixture);
    expect(names()).toEqual(['bob', 'nelly']);
    kind.value = 'archer';
    kind.dispatchEvent(new Event('change'));
    await tick(fixture);
    expect(names()).toEqual(['cara']);
    kind.value = '';
    kind.dispatchEvent(new Event('change'));
    await tick(fixture);

    // a card closed by hand stays closed – the filter opened the matches only once
    el.querySelector<HTMLButtonElement>('.player__head')!.click();
    await tick(fixture);
    expect(opened()).toEqual(['cara', 'nelly']);
    kind.value = 'cavalry';
    kind.dispatchEvent(new Event('change'));
    await tick(fixture);
    expect(opened()).toEqual(['nelly']);
    kind.value = '';
    kind.dispatchEvent(new Event('change'));

    // another commander: in the address, its players open
    select.value = 'Gorgo';
    select.dispatchEvent(new Event('change'));
    await tick(fixture);
    await tick(fixture);
    expect(names()).toEqual(['dan']);
    expect(opened()).toEqual(['dan']);
    expect(router.url).toBe('/?cmd=Gorgo');
    // the tabs and the commander keep each other in the address
    el.querySelectorAll<HTMLButtonElement>('.tabs button')[1].click();
    await tick(fixture);
    expect(router.url).toBe('/?cmd=Gorgo&tab=prehlad');
    el.querySelectorAll<HTMLButtonElement>('.tabs button')[0].click();
    await tick(fixture);
    expect(router.url).toBe('/?cmd=Gorgo');
    // cleared: gone from the address, everyone again
    select.value = '';
    select.dispatchEvent(new Event('change'));
    await tick(fixture);
    expect(router.url).toBe('/');
    expect(names()).toEqual(['bob', 'cara', 'nelly', 'dan']);
    http.match(() => true).forEach((r) => r.flush({}));
  });

  it('a new player waits for the superadmin instead of the list', async () => {
    const http = setup({ name: 'Nova', approved: false });
    const fixture = TestBed.createComponent(PlayersMarches);
    fixture.detectChanges();
    await tick(fixture);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-pending-approval')?.textContent).toContain('Čakáš na schválenie');
    expect(el.querySelector('.tabs')).toBeNull();
    http.expectNone('/api/marches/');
    http.match(() => true).forEach((r) => r.flush([]));
  });
});

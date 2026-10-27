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

function setup(user: { name: string; approved: boolean; evaluation_settings?: boolean; evaluation_overview?: boolean; is_superuser?: boolean }) {
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
          canEvaluate: signal(!!(user.evaluation_settings || user.evaluation_overview || user.is_superuser)),
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
    fixture.componentRef.setInput('tab', 'hraci');
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
        { id: 2, name: 'bob', ingame_name: '', avatar_url: '', public: true, me: false, marches: [MARCH], updated_at: '2026-10-12T12:00:00Z' },
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

    // two tabs: the player's own marches first (the plain /marche), then the players'
    expect(Array.from(el.querySelectorAll('.tabs button'), (b) => b.textContent?.trim())).toEqual(['Prehľad marchov', 'Marche hráčov']);
    http.match(() => true).forEach((r) => r.flush({}));
  });

  it('filters by commander – with the type it is one march – opens the matches once and keeps ?cmd= in the address', async () => {
    const http = setup({ name: 'Nelly', approved: true });
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/?cmd=Attila');
    const fixture = TestBed.createComponent(PlayersMarches);
    // the router gives the page ?cmd= as an input
    fixture.componentRef.setInput('cmd', 'Attila');
    fixture.componentRef.setInput('tab', 'hraci');
    fixture.detectChanges();
    const march = (id: number, kind: string, primary: string, secondary: string) => ({ ...MARCH, id, position: id, kind, primary, secondary });
    const player = (id: number, name: string, updated_at: string, marches: object[]) =>
      ({ id, name, ingame_name: '', avatar_url: '', public: true, me: false, marches, updated_at });
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
    expect(router.url).toBe('/?cmd=Gorgo&tab=hraci');
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

  it('shows the superadmin a wrong pair or formation on a closed player and on the march (Gether 14. 10. 2026)', async () => {
    const http = setup({ name: 'Gether', approved: true, is_superuser: true });
    const fixture = TestBed.createComponent(PlayersMarches);
    fixture.componentRef.setInput('tab', 'hraci');
    fixture.detectChanges();
    const wrong = [
      { ...MARCH, secondary: '', pair_problem: 'solo', formation_problem: null },
      { ...MARCH, id: 2, position: 2, pair_problem: null, formation_problem: ['arch'] },
      { ...MARCH, id: 3, position: 3, pair_problem: null, formation_problem: null },
      // only the other order is in the pair table
      { ...MARCH, id: 4, position: 4, primary: 'Takeda Shingen', secondary: 'Attila', pair_problem: 'unknown', pair_hint: { swap: true }, formation_problem: null },
      { ...MARCH, id: 5, position: 5, pair_problem: 'unknown', pair_hint: { swap: false }, formation_problem: null },
    ];
    const player = { name: 'bob', ingame_name: 'Bob', avatar_url: '', public: true, me: false, updated_at: '2026-10-12T12:00:00Z' };
    http.expectOne('/api/marches/').flush({
      reviewer: true,
      players: [
        { ...player, id: 1, marches: wrong },
        // the server leaves the fields out for the others' marches it does not tell about
        { ...player, id: 2, name: 'eve', ingame_name: 'Eve', marches: [MARCH] },
      ],
    });
    http.expectOne('/api/commanders/marches/').flush([{ name: 'Attila', icon: '/static/guides/commanders/attila.webp', pick: true }]);
    await tick(fixture);
    const el = fixture.nativeElement as HTMLElement;
    const rows = Array.from(el.querySelectorAll<HTMLElement>('.player'));
    const bob = rows.find((r) => r.textContent?.includes('Bob'))!;
    const eve = rows.find((r) => r.textContent?.includes('Eve'))!;
    expect(bob.classList).toContain('has-problem');
    expect(bob.querySelector('.tag--problem')?.textContent).toContain('Na opravu: 4');
    // Takeda Shingen has no portrait here, so no mini
    expect(bob.querySelectorAll('.player__mini.is-bad').length).toBe(3);
    expect(eve.classList).not.toContain('has-problem');
    expect(eve.querySelector('.tag--problem')).toBeNull();
    // opened: the red cards with what is wrong
    bob.querySelector<HTMLButtonElement>('.player__head')!.click();
    await tick(fixture);
    http.expectOne('/api/armory/').flush(ARMORY);
    await tick(fixture);
    const cards = Array.from(bob.querySelectorAll('app-march-build'));
    expect(cards.map((c) => c.classList.contains('is-bad-pair'))).toEqual([true, true, false, true, true]);
    const notes = Array.from(bob.querySelectorAll('.mb__pair-problem'), (n) => n.textContent?.trim());
    expect(notes[0]).toContain('Chýba sekundárny commander');
    expect(notes[1]).toContain('Attila má viesť formáciu');
    expect(notes[1]).toContain('nie Delta');
    // the fix named under the warning: the other order, the names as on the march
    expect(notes[2]).toContain('Tento pár sa vo vyhodnocovaní KvK nepočíta');
    expect(notes[2]).toContain('Hodnotí sa opačné poradie: Attila + Takeda Shingen.');
    expect(Array.from(bob.querySelectorAll('.mb__pair-hint'), (n) => n.textContent?.trim())).toEqual(['Hodnotí sa opačné poradie: Attila + Takeda Shingen.']);
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

  describe('?hrac= – one player, from a row of /vyhodnocovanie', () => {
    const player = (id: number, name: string, extra: object = {}) => ({
      id,
      name,
      ingame_name: '',
      avatar_url: '',
      public: true,
      me: false,
      marches: [MARCH],
      updated_at: '2026-10-12T12:00:00Z',
      ...extra,
    });

    async function load(user: Parameters<typeof setup>[0], hrac: string | undefined, players: object[]) {
      const http = setup(user);
      const router = TestBed.inject(Router);
      await router.navigateByUrl(hrac ? `/?cmd=Attila&hrac=${hrac}` : '/?tab=hraci');
      const fixture = TestBed.createComponent(PlayersMarches);
      // the players' tab (?tab=hraci) – a link with ?hrac= opens it by itself
      if (!hrac) fixture.componentRef.setInput('tab', 'hraci');
      if (hrac) {
        fixture.componentRef.setInput('cmd', 'Attila');
        fixture.componentRef.setInput('hrac', hrac);
      }
      fixture.detectChanges();
      http.expectOne('/api/marches/').flush({ reviewer: false, players });
      http.match('/api/commanders/marches/').forEach((r) => r.flush([]));
      await tick(fixture);
      await tick(fixture);
      http.match('/api/armory/').forEach((r) => r.flush(ARMORY));
      await tick(fixture);
      return { fixture, router, el: fixture.nativeElement as HTMLElement };
    }

    const names = (el: HTMLElement) => Array.from(el.querySelectorAll('.player__name'), (n) => n.textContent);

    it('shows only that player, opened; the chip brings everyone back and drops ?hrac from the address', async () => {
      const { fixture, router, el } = await load({ name: 'Nelly', approved: true }, '2', [player(1, 'nelly'), player(2, 'bob'), player(3, 'cara')]);
      expect(names(el)).toEqual(['bob']);
      expect(el.querySelector('.player.is-open .player__name')?.textContent).toBe('bob');
      const chip = el.querySelector<HTMLButtonElement>('.focus__chip')!;
      expect(chip.textContent).toContain('Hráč: bob');
      chip.click();
      await tick(fixture);
      // ?cmd= stays, the players' tab too
      expect(router.url).toBe('/?cmd=Attila&tab=hraci');
      // the router gives the page the address without ?hrac=, on the players' tab
      fixture.componentRef.setInput('hrac', undefined);
      fixture.componentRef.setInput('tab', 'hraci');
      await tick(fixture);
      expect(names(el)).toEqual(['bob', 'cara', 'nelly']);
      expect(el.querySelector('.focus__chip')).toBeNull();
    });

    it('a player the visitor does not see: a plain sentence, nothing about them in the page', async () => {
      // the API leaves out the player of ?hrac= (not public, not approved…) – the page asks nobody else for them
      const { fixture, router, el } = await load({ name: 'Nelly', approved: true }, '731', [player(1, 'nelly'), player(2, 'bob')]);
      const asked = TestBed.inject(HttpTestingController).match(() => true).map((r) => r.request.urlWithParams);
      expect(asked.filter((url) => /731|marches|evaluation|kvk|players/.test(url))).toEqual([]);
      expect(el.querySelector('.focus__missing')?.textContent).toContain('Tohto hráča tu nevidíš alebo nemá marche.');
      expect(el.querySelectorAll('.player').length).toBe(0);
      expect(el.querySelector('.focus__chip')).toBeNull();
      expect(el.textContent).not.toContain('731');
      expect(el.querySelector('[id$="-731"], [href*="731"]')).toBeNull();
      const all = Array.from(el.querySelectorAll<HTMLButtonElement>('.focus__missing button')).find((b) => b.textContent?.trim() === 'Zobraziť všetkých')!;
      all.click();
      await tick(fixture);
      expect(router.url).toBe('/?cmd=Attila&tab=hraci');
    });

    it('links a player to /vyhodnocovanie only for the ones with it in the account menu', async () => {
      const players = [player(1, 'nelly'), player(2, 'nova')];
      const links = (el: HTMLElement) =>
        Array.from(el.querySelectorAll<HTMLAnchorElement>('.player__links a'), (a) => a.getAttribute('href'));
      const openAll = async (fixture: { detectChanges(): void }, el: HTMLElement) => {
        el.querySelector<HTMLButtonElement>('.bar .pill-btn')!.click();
        await tick(fixture);
      };

      // with "Vyh. nastavenia": every player (the API lists approved players only)
      let page = await load({ name: 'Slim', approved: true, evaluation_settings: true }, undefined, players);
      await openAll(page.fixture, page.el);
      expect(page.el.querySelectorAll('.player.is-open').length).toBe(2);
      expect(links(page.el)).toEqual(['/vyhodnocovanie?hrac=1', '/vyhodnocovanie?hrac=2']);
      TestBed.resetTestingModule();

      // a regular approved player and an R4 without the evaluation: no link
      for (const user of [{ name: 'Nelly', approved: true }, { name: 'Hefarion', approved: true, kvk_reviewer: true }]) {
        page = await load(user, undefined, players);
        await openAll(page.fixture, page.el);
        expect(page.el.querySelectorAll('.player.is-open').length).toBe(2);
        expect(links(page.el)).toEqual([]);
        TestBed.resetTestingModule();
      }
    });
  });
});

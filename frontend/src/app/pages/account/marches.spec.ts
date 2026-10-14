import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ARMORY } from '../../core/armory-testing';
import { March } from '../../core/kvk-api';
import { Marches } from './marches';
import { PlayersAdmin } from './players-admin';

const MARCH: March = { id: 1, position: 1, kind: '', primary: '', secondary: '' };
const COMMANDERS = [
  { name: 'Attila', icon: '/static/guides/commanders/attila.webp', pick: true },
  // a golden-key commander: only for the portrait of an old march, not offered
  { name: 'Cao Cao', icon: '/static/guides/commanders/cao-cao.webp', pick: false },
  { name: 'Takeda Shingen', icon: '/static/guides/commanders/takeda-shingen.webp', pick: true },
];

function setup() {
  TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
  return TestBed.inject(HttpTestingController);
}

// the save chain (march, then each screenshot) continues in plain promises after each response
const settle = async (fixture: { whenStable(): Promise<unknown> }) => {
  await fixture.whenStable();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
};

const tick = async (fixture: { detectChanges(): void }) => {
  await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
};

describe('Marches', () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  });

  it('saves a march with its type and commander, then goes on to its equipment and armaments', async () => {
    const http = setup();
    const fixture = TestBed.createComponent(Marches);
    fixture.detectChanges();
    http.expectOne('/api/me/marches/').flush({ marches: [], max: 7 });
    http.expectOne('/api/commanders/marches/').flush(COMMANDERS);
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.add-march')?.textContent).toContain('Pridať prvý march');

    el.querySelector<HTMLButtonElement>('.add-march')!.click();
    await fixture.whenStable();
    // nothing is sent before "Uložiť"; the next march waits
    expect(el.querySelector('.add-march')).toBeNull();
    expect(el.textContent).toContain('Ďalší march pridáš, keď tento uložíš.');
    const save = () => el.querySelector<HTMLButtonElement>('.march--editing .form__actions .pill-btn')!;
    expect(save().textContent?.trim()).toBe('Uložiť a naklikať výbavu');
    save().click();
    await fixture.whenStable();
    expect(el.textContent).toContain('Vyber typ marchu.');
    // the type comes first (Gether 13. 10. 2026): no commander before it
    expect(el.querySelector('.march--editing .tile')).toBeNull();
    expect(el.querySelector('.kind-first')?.textContent?.trim()).toBe('Najprv vyber typ marchu.');

    el.querySelectorAll<HTMLButtonElement>('.kind')[1].click();
    await fixture.whenStable();
    // a second click keeps the type
    el.querySelectorAll<HTMLButtonElement>('.kind')[1].click();
    await fixture.whenStable();
    expect(el.querySelectorAll('.kind')[1].getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector('.kind-first')).toBeNull();
    // only the type and the commanders: no screenshot, the bonuses are typed in the build editor
    expect(el.querySelector('.march--editing input[type="file"]')).toBeNull();
    expect(el.querySelector('.march--editing .stat-field')).toBeNull();
    el.querySelector<HTMLButtonElement>('.tile')!.click();
    await fixture.whenStable();
    const tiles = Array.from(el.querySelectorAll<HTMLButtonElement>('.picker-tile'));
    expect(tiles.map((t) => t.textContent?.trim())).toEqual(['Attila', 'Takeda Shingen']);
    tiles[0].click();
    await fixture.whenStable();
    // the commander is expertise by default; switched off it starts at 5111, every level 1–5
    const expertise = el.querySelector<HTMLInputElement>('.skills__expertise input')!;
    expect(expertise.checked).toBe(true);
    expect(el.querySelector('.skills__level')).toBeNull();
    expertise.click();
    await fixture.whenStable();
    const levels = () => Array.from(el.querySelectorAll<HTMLSelectElement>('.skills__level'));
    expect(levels().map((s) => s.value)).toEqual(['5', '1', '1', '1']);
    levels()[1].value = '3';
    levels()[1].dispatchEvent(new Event('change'));
    await fixture.whenStable();
    save().click();
    const req = http.expectOne((r) => r.method === 'POST' && r.url === '/api/me/marches/');
    expect(req.request.body).toEqual({ kind: 'cavalry', primary: 'Attila', secondary: '', primary_skills: '5311', secondary_skills: '5555' });
    req.flush({ ...MARCH, kind: 'cavalry', primary: 'Attila', attack: null, defense: null, health: null, damage: null, gold: 0, blue: 0, white: 0 });
    // the card loads the catalog of items and inscriptions
    await tick(fixture);
    http.expectOne('/api/armory/').flush(ARMORY);
    await settle(fixture);
    // the new march is a card, its editor opens right away
    expect(el.querySelector('.march--editing')).toBeNull();
    expect(el.querySelector('.mb__primary')?.textContent?.trim()).toBe('Attila');
    const dialog = el.querySelector('dialog.be')!;
    expect(dialog.hasAttribute('open')).toBe(true);
    dialog.querySelector<HTMLButtonElement>('.be__item')!.click();
    await settle(fixture);
    // ATK, DEF and HP are required: "Uložiť" shows the Armamenty tab with them marked
    const saveBuild = () => dialog.querySelector<HTMLButtonElement>('.be__actions .pill-btn')!;
    saveBuild().click();
    await settle(fixture);
    http.expectNone('/api/me/marches/1/');
    expect(dialog.textContent).toContain('Vyplň ATK, DEF a HP');
    const labels = Array.from(dialog.querySelectorAll('.be__stat-label'), (l) => l.textContent?.trim());
    expect(labels).toEqual(['Cav ATK', 'Cav DEF', 'Cav HP', 'All DMG']);
    const stat = (i: number, value: string) => {
      const input = dialog.querySelectorAll<HTMLInputElement>('.be__stat-input')[i];
      input.value = value;
      input.dispatchEvent(new Event('input'));
      return input;
    };
    expect(dialog.querySelectorAll('.be__stat-input[aria-invalid="true"]').length).toBe(3);
    // two digits and one decimal (Gether 12. 10. 2026): anything else is dropped as it is typed; All DMG may stay empty = 0
    expect(stat(0, 'x12,55%').value).toBe('12,5');
    expect(stat(0, '12.5').value).toBe('12,5');
    stat(1, '8');
    stat(2, '0');
    saveBuild().click();
    const build = http.expectOne((r) => r.method === 'PATCH' && r.url === '/api/me/marches/1/');
    expect(build.request.body).toEqual({
      // a new gold item starts at iconic I (Gether 13. 10. 2026)
      gear: { weapon: { item: 'sacred-dominion', crit: false, iconic: 1 } },
      formation: '',
      inscriptions: [],
      attack: 12.5,
      defense: 8,
      health: 0,
      damage: 0,
    });
    build.flush({ ...MARCH, kind: 'cavalry', primary: 'Attila', gold: 0, blue: 0, white: 0, ...build.request.body });
    await settle(fixture);
    expect(el.querySelector('app-march-build .gear__icon')?.getAttribute('src')).toBe('/static/guides/gear/sacred-dominion.webp');
    // no headings (as little text as possible) – the columns are named for screen readers; the full "Cav ATK" in the title
    expect(el.querySelector('.mb__label')).toBeNull();
    expect(Array.from(el.querySelectorAll('.mb__part'), (p) => p.getAttribute('aria-label'))).toEqual(['Výbava', 'Armamenty']);
    // compact: no bonuses in % until "Detail" (Gether 13. 10. 2026)
    expect(el.querySelector('.mb__stats')).toBeNull();
    const detail = el.querySelector<HTMLButtonElement>('.mb__detail')!;
    expect([detail.textContent?.trim(), detail.getAttribute('aria-expanded')]).toEqual(['Detail', 'false']);
    detail.click();
    await settle(fixture);
    expect([detail.textContent?.trim(), detail.getAttribute('aria-expanded')]).toEqual(['Skryť detail', 'true']);
    expect(el.querySelector('app-march-build')?.classList).toContain('is-detail');
    const stats = Array.from(el.querySelectorAll<HTMLElement>('.mb__part:last-child .mb__stats li'));
    expect(stats.map((s) => s.title)).toEqual(['Cav ATK', 'Cav DEF', 'Cav HP', 'All DMG']);
    // a decimal comma
    expect(stats[0].textContent).toContain('12,5%');
    expect(el.querySelector('.march__build')?.textContent?.trim()).toBe('Upraviť výbavu');
    expect(el.querySelector('.add-march')?.textContent).toContain('Pridať druhý march');
    http.verify();
  });

  it('clicks the equipment and armaments of a march together and saves them', async () => {
    const BUILT = { ...MARCH, id: 3, kind: 'cavalry' as const, primary: 'Attila', secondary: 'Takeda Shingen', attack: 12, defense: 8, health: 6, gear: {}, formation: '', inscriptions: [] };
    const http = setup();
    const fixture = TestBed.createComponent(Marches);
    fixture.detectChanges();
    http.expectOne('/api/me/marches/').flush({ marches: [BUILT], max: 7, public: false });
    http.expectOne('/api/commanders/marches/').flush(COMMANDERS);
    await tick(fixture);
    await tick(fixture);
    http.expectOne('/api/armory/').flush(ARMORY);
    await tick(fixture);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.mb__primary')?.textContent?.trim()).toBe('Attila');
    // an own march without equipment shows its empty slots as buttons – a tile opens the editor on its slot
    expect(el.querySelectorAll('app-march-build button.gear__tile').length).toBe(8);
    expect(el.querySelectorAll('app-march-build button.mb__missing').length).toBe(2);

    el.querySelector<HTMLButtonElement>('.march__build')!.click();
    await tick(fixture);
    const dialog = el.querySelector('dialog.be')!;
    expect(dialog.hasAttribute('open')).toBe(true);
    const tiles = () => [...dialog.querySelectorAll<HTMLButtonElement>('.gear__tile')];
    expect(tiles()[0].getAttribute('aria-pressed')).toBe('true');
    // only the weapons of the catalog
    const items = () => [...dialog.querySelectorAll<HTMLButtonElement>('.be__item')];
    expect(items().map((b) => b.textContent?.trim())).toEqual(['Sacred Dominion']);
    items()[0].click();
    await tick(fixture);
    // the slot stays chosen (crit and iconic right below, the focus on the item), the tile shows its icon
    expect(tiles()[0].getAttribute('aria-pressed')).toBe('true');
    expect(items()[0].getAttribute('aria-pressed')).toBe('true');
    expect(tiles()[0].querySelector('img')?.getAttribute('src')).toBe('/static/guides/gear/sacred-dominion.webp');
    // Zrušiť leaves the march as it was, the next opening starts from it again
    dialog.querySelector<HTMLButtonElement>('.be__actions .pill-btn--quiet')!.click();
    await tick(fixture);
    expect(el.querySelector('app-march-build .gear__icon')).toBeNull();
    el.querySelector<HTMLButtonElement>('.march__build')!.click();
    await tick(fixture);
    expect(tiles()[0].querySelector('img')).toBeNull();
    items()[0].click();
    await tick(fixture);
    dialog.querySelector<HTMLInputElement>('.be__crit input')!.click();
    await tick(fixture);
    [...dialog.querySelectorAll<HTMLButtonElement>('.be__iconic button')].find((b) => b.textContent?.trim() === 'III')!.click();
    await tick(fixture);
    // Cav ATK of the crit
    expect(dialog.querySelector('.be__stats')?.textContent).toContain('32,5%');

    dialog.querySelectorAll<HTMLButtonElement>('.be__tabs button')[1].click();
    await tick(fixture);
    const formations = () => [...dialog.querySelectorAll<HTMLButtonElement>('.be__formation')];
    const inscriptions = () => [...dialog.querySelectorAll<HTMLButtonElement>('button.insc')];
    // without a formation only the common ones
    expect(inscriptions().map((b) => b.textContent?.trim())).toEqual(['Enduring', 'Watchmen', 'Patronage']);
    formations()[0].click();
    await tick(fixture);
    expect(inscriptions().map((b) => b.textContent?.trim())).toEqual(['Relentless', 'Enduring', 'Watchmen', 'Patronage', 'Thrasher']);
    // two of each armament at most: the third emblem one is blocked
    inscriptions()[0].click();
    inscriptions()[1].click();
    await tick(fixture);
    expect(dialog.querySelector('.be__piece-count')?.textContent).toBe('2/2');
    expect(inscriptions()[2].getAttribute('aria-disabled')).toBe('true');
    inscriptions()[2].click();
    await tick(fixture);
    expect(inscriptions()[2].getAttribute('aria-pressed')).toBe('false');
    inscriptions()[0].click();
    inscriptions()[1].click();
    inscriptions()[4].click();
    inscriptions()[3].click();
    await tick(fixture);
    // another formation: its own inscriptions instead, the common one stays
    formations()[1].click();
    await tick(fixture);
    expect(inscriptions().filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent?.trim())).toEqual([
      'Patronage',
    ]);
    inscriptions().find((b) => b.textContent?.trim() === 'Toppler')!.click();
    await tick(fixture);

    dialog.querySelector<HTMLButtonElement>('.be__actions .pill-btn')!.click();
    const saved = http.expectOne((r) => r.method === 'PATCH' && r.url === '/api/me/marches/3/');
    expect(saved.request.method).toBe('PATCH');
    expect(saved.request.body).toEqual({
      gear: { weapon: { item: 'sacred-dominion', crit: true, iconic: 3 } },
      formation: 'pincer',
      inscriptions: ['u-instrument-patronage', 'pincer-scroll-toppler'],
      attack: 12,
      defense: 8,
      health: 6,
      damage: 0,
    });
    saved.flush({ ...BUILT, ...saved.request.body });
    await tick(fixture);
    await tick(fixture);
    expect(dialog.hasAttribute('open')).toBe(false);
    // the card shows the build
    // the formation as its icon only, the inscriptions gold first
    expect(el.querySelector('.mb__formation img')?.getAttribute('alt')).toBe('Pincer');
    expect([...el.querySelectorAll('.mb__inscs .insc')].map((i) => i.textContent?.trim())).toEqual(['Toppler', 'Patronage']);
    expect(el.querySelector('app-march-build .gear__iconic')?.textContent).toBe('III');
    expect(el.querySelector('app-march-build .gear__crit')).not.toBeNull();
    // nothing empty any more: no red link, no hint
    expect(el.querySelector('app-march-build button.mb__missing')).toBeNull();
    expect(el.querySelector('.march-hint--alert')).toBeNull();
    http.verify();
  });

  it('stops at seven and removes a march from its editor only on the second click', async () => {
    const http = setup();
    const fixture = TestBed.createComponent(Marches);
    fixture.detectChanges();
    const seven = Array.from({ length: 7 }, (_, i) => ({ ...MARCH, id: i + 1, position: i + 1 }));
    // the second one has its formation, only the bonuses are missing
    seven[1] = { ...seven[1], formation: 'pincer' };
    http.expectOne('/api/me/marches/').flush({ marches: seven, max: 7 });
    http.expectOne('/api/commanders/marches/').flush(COMMANDERS);
    await tick(fixture);
    http.expectOne('/api/armory/').flush(ARMORY);
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.add-march')).toBeNull();
    // empty equipment, empty armaments or missing bonuses: red links, each opens the editor on its tab
    expect(el.textContent).toContain('Neúplné marche: 7');
    const links = (card: number) => [...el.querySelectorAll('app-march-build')[card].querySelectorAll<HTMLButtonElement>('button.mb__missing')];
    expect(links(0).map((b) => b.textContent?.trim())).toEqual(['Doplň výbavu', 'Doplň armamenty']);
    expect(links(1).map((b) => b.textContent?.trim())).toEqual(['Doplň výbavu', 'Doplň bonusy armamentov']);
    const pressedTab = () => el.querySelector('dialog.be .be__tabs button[aria-pressed="true"]');
    const closeEditor = async () => {
      el.querySelector<HTMLButtonElement>('dialog.be .be__actions .pill-btn--quiet')!.click();
      await tick(fixture);
    };
    links(0)[1].click();
    await tick(fixture);
    expect(pressedTab()?.textContent).toContain('Armamenty');
    // both tabs red while empty
    expect([...el.querySelectorAll('dialog.be .be__tab.is-empty')].length).toBe(2);
    await closeEditor();
    links(0)[0].click();
    await tick(fixture);
    expect(pressedTab()?.textContent).toContain('Výbava');
    await closeEditor();
    links(1)[1].click();
    await tick(fixture);
    expect(pressedTab()?.textContent).toContain('Armamenty');
    // the formation is there: only the Výbava tab is red
    const red = [...el.querySelectorAll('dialog.be .be__tab.is-empty')];
    expect(red.length).toBe(1);
    expect(red[0].textContent).toContain('Výbava');
    await closeEditor();

    // removing is in the editor of the march
    el.querySelector<HTMLButtonElement>('.march__edit')!.click();
    await fixture.whenStable();
    const remove = () => el.querySelector<HTMLButtonElement>('.march__remove')!;
    remove().click();
    await fixture.whenStable();
    http.expectNone('/api/me/marches/1/');
    remove().click();
    http.expectOne((r) => r.method === 'DELETE' && r.url === '/api/me/marches/1/').flush(null, { status: 204, statusText: '' });
    await settle(fixture);
    expect(Array.from(el.querySelectorAll('.mb__num'), (t) => t.textContent?.trim())).toEqual([
      '1.',
      '2.',
      '3.',
      '4.',
      '5.',
      '6.',
    ]);
    expect(el.querySelector('.add-march')?.textContent).toContain('siedmy');
    http.verify();
  });
});

describe('PlayersAdmin', () => {
  it('approves a new player and switches R4, filters both and puts a switch back when saving fails', async () => {
    const http = setup();
    const fixture = TestBed.createComponent(PlayersAdmin);
    fixture.detectChanges();
    const player = {
      avatar_url: '',
      reviewer: false,
      approved: true,
      superuser: false,
      created_at: '2026-10-01T12:00:00Z',
      last_login: null,
      marches: 0,
      kvk: [],
      evaluator: false,
      evaluation_settings: false,
    };
    http.expectOne('/api/kvk/reviewers/').flush({
      players: [
        { ...player, id: 1, name: 'gether', ingame_name: 'Gether', superuser: true, last_login: '2026-10-13T07:05:00Z' },
        { ...player, id: 2, name: 'nelly', ingame_name: 'Nelly', created_at: '2026-10-05T12:00:00Z', marches: 3, kvk: ['garrison', 'rally'] },
        { ...player, id: 3, name: 'nova', ingame_name: '', approved: false, created_at: '2026-10-12T12:00:00Z' },
      ],
      auto_approve: false,
    });
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    const names = () => Array.from(el.querySelectorAll('.reviewer__name strong'), (n) => n.childNodes[0].textContent?.trim());
    // the new player waits on top; the superuser has no switches
    expect(names()).toEqual(['nova', 'Gether', 'Nelly']);
    expect(el.querySelector('.reviewer.is-pending .tag--pending')?.textContent).toBe('Čaká');
    // the first sign-in with its time, the last one, marches and KvK sign-ups (Gether 13. 10. 2026)
    const details = () => Array.from(el.querySelectorAll('.reviewer__name > span'), (n) => n.textContent?.trim());
    expect(details()).toEqual([
      'od 12. 10. 2026 14:00',
      'gether · superadmin · od 1. 10. 2026 14:00 · naposledy 13. 10. 2026 9:05',
      'nelly · od 5. 10. 2026 14:00 · 3 marche · KvK rally, garrison',
    ]);
    // sorting keeps the waiting player on top; filters for marches and KvK
    const select = (id: string, value: string) => {
      const box = el.querySelector<HTMLSelectElement>(id)!;
      box.value = value;
      box.dispatchEvent(new Event('change'));
    };
    select('#players-sort', 'newest');
    await settle(fixture);
    expect(names()).toEqual(['nova', 'Nelly', 'Gether']);
    select('#players-sort', 'login');
    await settle(fixture);
    expect(names()).toEqual(['nova', 'Gether', 'Nelly']);
    select('#players-sort', 'marches');
    await settle(fixture);
    expect(names()).toEqual(['nova', 'Nelly', 'Gether']);
    select('#players-sort', 'name');
    select('#players-marches', 'with');
    await settle(fixture);
    expect(names()).toEqual(['Nelly']);
    select('#players-marches', 'without');
    select('#players-kvk', 'rally');
    await settle(fixture);
    expect(names()).toEqual([]);
    select('#players-marches', 'all');
    select('#players-kvk', 'none');
    await settle(fixture);
    expect(names()).toEqual(['nova', 'Gether']);
    select('#players-kvk', 'all');
    await settle(fixture);
    // approved, R4 and the two of the evaluation for each player but the superuser, explained once above the list
    expect(el.querySelectorAll('.reviewer .switch').length).toBe(8);
    expect(el.querySelectorAll('.switch-legend li').length).toBe(4);
    expect(el.querySelectorAll('.switch-legend app-eval-tip').length).toBe(4);
    const filters = () => Array.from(el.querySelectorAll<HTMLButtonElement>('.list__filters button'));
    expect(filters().map((b) => b.textContent?.trim())).toEqual([
      'Všetci · 3',
      'Čakajú · 1',
      'Schválení · 2',
      'Všetci · 3',
      'R4 · 0',
      'Bez R4 · 3',
    ]);
    filters()[1].click();
    await settle(fixture);
    expect(names()).toEqual(['nova']);

    // approve: the row stays until another filter is picked, the counts follow at once
    el.querySelector<HTMLInputElement>('.reviewer .switch')!.click();
    const req = http.expectOne('/api/kvk/reviewers/3/');
    expect(req.request.body).toEqual({ approved: true });
    req.flush({ id: 3, reviewer: false, approved: true });
    await settle(fixture);
    expect(names()).toEqual(['nova']);
    expect(filters()[1].textContent?.trim()).toBe('Čakajú · 0');
    filters()[0].click();
    await settle(fixture);
    expect(names()).toEqual(['nova', 'Gether', 'Nelly']);
    expect(el.querySelector('.tag--pending')).toBeNull();

    // R4 of Nelly; the filter R4 shows only her
    const r4 = () => el.querySelectorAll<HTMLInputElement>('.reviewer .switch')[5];
    r4().click();
    const flags = { reviewer: true, approved: true, evaluator: false, evaluation_settings: false };
    http.expectOne('/api/kvk/reviewers/2/').flush({ id: 2, ...flags });
    // the evaluation of Nelly: its table and its variables, two switches (Gether 13. and 14. 10. 2026)
    const evaluator = el.querySelectorAll<HTMLInputElement>('.reviewer .switch')[6];
    expect(evaluator.getAttribute('aria-label')).toBe('Tabuľka vyhodnocovania – odhad acclaimu a power hráčov: Nelly');
    evaluator.click();
    const ev = http.expectOne('/api/kvk/reviewers/2/');
    expect(ev.request.body).toEqual({ evaluator: true });
    ev.flush({ id: 2, ...flags, evaluator: true });
    await settle(fixture);
    expect(evaluator.checked).toBe(true);
    const variables = el.querySelectorAll<HTMLInputElement>('.reviewer .switch')[7];
    expect(variables.getAttribute('aria-label')).toBe('Nastavenia vyhodnocovania – premenné a páry commanderov: Nelly');
    variables.click();
    const vs = http.expectOne('/api/kvk/reviewers/2/');
    expect(vs.request.body).toEqual({ evaluation_settings: true });
    vs.flush({ id: 2, ...flags, evaluator: true, evaluation_settings: true });
    await settle(fixture);
    expect(variables.checked).toBe(true);
    await settle(fixture);
    filters()[4].click();
    await settle(fixture);
    expect(names()).toEqual(['Nelly']);

    el.querySelectorAll<HTMLInputElement>('.reviewer .switch')[1].click();
    http.expectOne('/api/kvk/reviewers/2/').flush('x', { status: 500, statusText: 'Server Error' });
    await settle(fixture);
    expect(el.querySelectorAll<HTMLInputElement>('.reviewer .switch')[1].checked).toBe(true);
    expect(el.querySelector('.form__state')?.textContent).toContain('nepodarilo');

    // auto-approve of new players: on, the hint follows; a failed save puts the switch back
    const auto = () => el.querySelector<HTMLInputElement>('.auto-approve .switch')!;
    const hint = () => el.querySelector('#auto-approve-hint')?.textContent;
    expect(auto().checked).toBe(false);
    expect(hint()).toContain('príde správa');
    auto().click();
    const on = http.expectOne('/api/kvk/reviewers/auto-approve/');
    expect([on.request.method, on.request.body]).toEqual(['PUT', { auto_approve: true }]);
    on.flush({ auto_approve: true });
    await settle(fixture);
    expect(auto().checked).toBe(true);
    expect(hint()).toContain('schválený hneď');
    auto().click();
    http.expectOne('/api/kvk/reviewers/auto-approve/').flush('x', { status: 500, statusText: 'Server Error' });
    await settle(fixture);
    expect(auto().checked).toBe(true);
    http.verify();
  });
});

describe('Marches visibility', () => {
  it('switches between R4 only and every player, and goes back when saving fails', async () => {
    const http = setup();
    const fixture = TestBed.createComponent(Marches);
    fixture.detectChanges();
    http.expectOne('/api/me/marches/').flush({ marches: [], max: 7, public: false });
    http.expectOne('/api/commanders/marches/').flush(COMMANDERS);
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    const [r4, all] = Array.from(el.querySelectorAll<HTMLButtonElement>('.visibility button'));
    expect(r4.getAttribute('aria-pressed')).toBe('true');

    all.click();
    const req = http.expectOne((r) => r.method === 'PATCH' && r.url === '/api/me/marches/');
    expect(req.request.body).toEqual({ public: true });
    req.flush({ public: true });
    await settle(fixture);
    expect(all.getAttribute('aria-pressed')).toBe('true');

    r4.click();
    http.expectOne((r) => r.method === 'PATCH').flush('x', { status: 500, statusText: 'Server Error' });
    await settle(fixture);
    expect(all.getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector('.visibility__error')?.textContent).toContain('Nepodarilo');
    http.verify();
  });
});

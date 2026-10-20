import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { ARMORY } from '../../core/armory-testing';
import { KvkApi, KvkSignup, KvkState } from '../../core/kvk-api';
import { Scroll } from '../../core/scroll';
import { KvkForm } from './kvk-form';
import { KvkPage } from './kvk-page';
import { KvkSignups } from './kvk-signups';

const STATE: KvkState = {
  signups: { rally: null, garrison: null },
  player: true,
  ingame_name: 'Nelly',
  approved: true,
  reviewer: false,
  superuser: false,
};
const SIGNUP: KvkSignup = {
  id: 9,
  role: 'rally',
  kind: 'cavalry',
  primary: 'Attila',
  secondary: 'Takeda Shingen',
  note: '',
  budget: 'to100',
  online: ['evenings'],
  updated_at: '2026-10-11T11:00:00Z',
  primary_skills: '5555',
  secondary_skills: '5555',
  gear: {},
  formation: '',
  inscriptions: [],
};
const COMMANDERS = [
  { name: 'Attila', icon: '/static/guides/commanders/attila.webp', pick: true },
  { name: 'Takeda Shingen', icon: '/static/guides/commanders/takeda-shingen.webp', pick: true },
];
function setup() {
  TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
  return TestBed.inject(HttpTestingController);
}

// no whenStable(): a card asks for the item catalog (/api/armory/), which stays pending until the test answers it
const flushAll = async (fixture: { detectChanges(): void }) => {
  for (let round = 0; round < 3; round++) {
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
  }
};

describe('KvkForm', () => {
  beforeEach(() => {
    URL.createObjectURL ??= () => 'blob:preview';
    URL.revokeObjectURL ??= () => undefined;
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  });

  it('is filled in like a march: troops, commanders with skills, note – then the build editor of the sign-up', async () => {
    const http = setup();
    const fixture = TestBed.createComponent(KvkForm);
    fixture.componentRef.setInput('state', STATE);
    fixture.detectChanges();
    http.expectOne('/api/commanders/marches/').flush(COMMANDERS);
    http.expectOne('/api/auth/me/').flush({ login_enabled: true, user: null });
    await flushAll(fixture);
    const el = fixture.nativeElement as HTMLElement;
    const submit = () => el.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    const state = () => el.querySelector('.form__state')?.textContent;
    expect(el.querySelector<HTMLInputElement>('#kvk-name')!.value).toBe('Nelly');
    // no heading set by the superuser any more (Gether 20. 10. 2026)
    expect(el.querySelector('#kvk-form-title')?.textContent?.trim()).toBe('Moja prihláška');
    // cavalry, infantry or archers; no screenshots, no bonuses in the form (they are clicked together after it)
    expect(el.querySelectorAll('.kind').length).toBe(3);
    expect(el.querySelector('input[type="file"]')).toBeNull();
    expect(el.querySelector('.stat-field')).toBeNull();

    // rally first; garrison is a second sign-up with its own army
    expect([...el.querySelectorAll('.role-tabs button')].map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    submit();
    await flushAll(fixture);
    expect(state()).toContain('Vyber typ marchu.');
    el.querySelectorAll<HTMLButtonElement>('.kind')[1].click();
    await flushAll(fixture);
    submit();
    await flushAll(fixture);
    expect(state()).toContain('Vyber primárneho commandera.');
    el.querySelector<HTMLButtonElement>('.tile')!.click();
    await flushAll(fixture);
    el.querySelector<HTMLButtonElement>('.picker-tile')!.click();
    await flushAll(fixture);
    // the commander is expertise by default
    expect(el.querySelector<HTMLInputElement>('.skills__expertise input')!.checked).toBe(true);
    const note = el.querySelector<HTMLTextAreaElement>('#kvk-note')!;
    note.value = ' večer online ';
    note.dispatchEvent(new Event('input'));
    expect(el.querySelector('form .pill-btn')?.textContent?.trim()).toBe('Prihlásiť sa a naklikať výbavu');
    // the survey (Gether 20. 10. 2026): how much into the KvK – one of four, with a rough CZK; when online – any
    submit();
    await flushAll(fixture);
    expect(state()).toContain('Vyber, koľko dávaš do KvK, a aspoň jeden čas, kedy si online.');
    const budgets = el.querySelectorAll<HTMLInputElement>('input[name="kvk-budget"]');
    expect(Array.from(budgets, (b) => b.closest('label')?.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'do 50 € ≈ 1 250 Kč',
      'do 100 € ≈ 2 500 Kč',
      'do 200 € ≈ 5 000 Kč',
      'nad 200 € ≈ 5 000+ Kč',
    ]);
    budgets[1].click();
    const online = el.querySelectorAll<HTMLInputElement>('.survey .chip input');
    expect(online.length).toBe(7);
    online[3].click();
    online[0].click();
    await flushAll(fixture);
    expect(el.querySelector('.survey__hint')?.textContent).toBe('Všetko je len orientačný odhad, nič nezáväzné.');
    submit();
    const req = http.expectOne('/api/kvk/signup/');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({
      ingame_name: 'Nelly',
      role: 'rally',
      kind: 'cavalry',
      primary: 'Attila',
      secondary: '',
      primary_skills: '5555',
      secondary_skills: '5555',
      note: 'večer online',
      budget: 'to100',
      // in the order of the form
      online: ['first_zone', 'evenings'],
    });
    req.flush({ ...SIGNUP, secondary: '', note: 'večer online', online: ['first_zone', 'evenings'] });
    await flushAll(fixture);
    http.expectOne('/api/armory/').flush(ARMORY);
    await flushAll(fixture);
    // the sign-up is a card like a march, its build editor opens right away
    expect(el.querySelector('.kvk-card .mb__primary')?.textContent?.trim()).toBe('Attila');
    expect(el.querySelector('.kvk-note')?.textContent).toBe('večer online');
    expect(Array.from(el.querySelectorAll('.survey-answers dd'), (d) => d.textContent?.trim())).toEqual([
      'do 100 € (≈ 2 500 Kč)',
      'Pri otvorení prvej zóny (zvyčajne piatok okolo 15:00 UTC), Večery',
    ]);
    const dialog = el.querySelector('dialog.be')!;
    expect(dialog.hasAttribute('open')).toBe(true);
    dialog.querySelector<HTMLButtonElement>('.be__item')!.click();
    await flushAll(fixture);
    dialog.querySelectorAll<HTMLButtonElement>('.be__tabs button')[1].click();
    await flushAll(fixture);
    const stats = dialog.querySelectorAll<HTMLInputElement>('.be__stat-input');
    ['12,5', '8', '6'].forEach((value, i) => {
      stats[i].value = value;
      stats[i].dispatchEvent(new Event('input'));
    });
    dialog.querySelector<HTMLButtonElement>('.be__actions .pill-btn')!.click();
    const build = http.expectOne((r) => r.method === 'PATCH' && r.url === '/api/kvk/signup/');
    expect(build.request.body).toEqual({
      role: 'rally',
      gear: { weapon: { item: 'sacred-dominion', crit: false, iconic: 1 } },
      formation: '',
      inscriptions: [],
      attack: 12.5,
      defense: 8,
      health: 6,
      damage: 0,
    });
    build.flush({ ...SIGNUP, secondary: '', note: 'večer online', online: ['first_zone', 'evenings'], ...build.request.body });
    await flushAll(fixture);
    expect(el.querySelector('.kvk-card .gear__icon')?.getAttribute('src')).toBe('/static/guides/gear/sacred-dominion.webp');
    expect(el.querySelector('.kvk-card .march__build')?.textContent?.trim()).toBe('Upraviť výbavu');
    // the rally tab is marked as sent; the garrison tab starts with an empty form
    expect(el.querySelector('.role-tabs button .role-tabs__done')).not.toBeNull();
    el.querySelectorAll<HTMLButtonElement>('.role-tabs button')[1].click();
    await flushAll(fixture);
    // the type comes first (Gether 13. 10. 2026)
    expect(el.querySelector('.tile')).toBeNull();
    expect(el.querySelector('.kind-first')?.textContent?.trim()).toBe('Najprv vyber typ marchu.');
    expect(el.querySelector('.kvk-card')).toBeNull();
    // …with the survey of the rally sign-up (the same player, the same KvK)
    expect(el.querySelector<HTMLInputElement>('input[name="kvk-budget"]:checked')?.value).toBe('to100');
    expect(Array.from(el.querySelectorAll<HTMLInputElement>('.survey .chip input'), (b) => b.checked)).toEqual([
      true, false, false, true, false, false, false,
    ]);
    http.verify();
  });

  it('a sign-up from before the survey asks for it on its card', async () => {
    const http = setup();
    const fixture = TestBed.createComponent(KvkForm);
    fixture.componentRef.setInput('state', { ...STATE, signups: { rally: { ...SIGNUP, budget: '', online: [] }, garrison: null } });
    fixture.detectChanges();
    http.expectOne('/api/commanders/marches/').flush(COMMANDERS);
    http.expectOne('/api/auth/me/').flush({ login_enabled: true, user: null });
    await flushAll(fixture);
    http.match('/api/armory/').forEach((r) => r.flush(ARMORY));
    await flushAll(fixture);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.survey-answers')).toBeNull();
    expect(el.querySelector('.survey-missing p')?.textContent?.trim()).toBe('!K prihláške chýba dotazník – koľko dávaš do KvK a kedy si online.');
    el.querySelector<HTMLButtonElement>('.survey-missing button')!.click();
    await flushAll(fixture);
    expect(el.querySelector('form .survey')).not.toBeNull();
    expect(el.querySelector('input[name="kvk-budget"]:checked')).toBeNull();
    http.verify();
  });

  it('a saved sign-up is its card; the pencil opens the form and Zrušiť drops the changes', async () => {
    const http = setup();
    const fixture = TestBed.createComponent(KvkForm);
    fixture.componentRef.setInput('state', { ...STATE, signups: { rally: null, garrison: { ...SIGNUP, role: 'garrison', note: 'mesto' } } });
    fixture.detectChanges();
    http.expectOne('/api/commanders/marches/').flush(COMMANDERS);
    http.expectOne('/api/auth/me/').flush({ login_enabled: true, user: null });
    await flushAll(fixture);
    http.expectOne('/api/armory/').flush(ARMORY);
    await flushAll(fixture);
    const el = fixture.nativeElement as HTMLElement;
    // the saved garrison sign-up opens its tab as a card
    expect(el.querySelector('.role-tabs button[aria-pressed="true"]')?.textContent).toContain('Garrison');
    expect(el.querySelector('form')).toBeNull();
    expect(el.querySelector('.kvk-note')?.textContent).toBe('mesto');
    el.querySelector<HTMLButtonElement>('.kvk-card .icon-btn')!.click();
    await flushAll(fixture);
    expect([...el.querySelectorAll('.tile__caption')].map((c) => c.textContent?.trim())).toEqual(['Attila', 'Takeda Shingen']);
    const note = el.querySelector<HTMLTextAreaElement>('#kvk-note')!;
    note.value = 'iné';
    note.dispatchEvent(new Event('input'));
    [...el.querySelectorAll<HTMLButtonElement>('form .pill-btn')].find((b) => b.textContent?.trim() === 'Zrušiť')!.click();
    await flushAll(fixture);
    expect(el.querySelector('form')).toBeNull();
    expect(el.querySelector('.kvk-note')?.textContent).toBe('mesto');
    http.expectNone('/api/kvk/signup/');
    http.verify();
  });

  it('withdraws the sign-up of one role, the other one stays', async () => {
    const http = setup();
    const fixture = TestBed.createComponent(KvkForm);
    fixture.componentRef.setInput('state', {
      ...STATE,
      signups: { rally: SIGNUP, garrison: { ...SIGNUP, id: 10, role: 'garrison', kind: 'archer' } },
    });
    fixture.detectChanges();
    http.expectOne('/api/commanders/marches/').flush(COMMANDERS);
    http.expectOne('/api/auth/me/').flush({ login_enabled: true, user: null });
    await flushAll(fixture);
    http.match('/api/armory/').forEach((r) => r.flush(ARMORY));
    await flushAll(fixture);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.role-tabs__done').length).toBe(2);

    const buttons = () => Array.from(el.querySelectorAll<HTMLButtonElement>('.withdraw button'));
    buttons()[0].click();
    await flushAll(fixture);
    buttons()[0].click();
    const req = http.expectOne((r) => r.method === 'DELETE' && r.url === '/api/kvk/signup/');
    expect(req.request.params.get('role')).toBe('rally');
    req.flush(null, { status: 204, statusText: '' });
    await flushAll(fixture);
    expect(el.querySelectorAll('.role-tabs__done').length).toBe(1);
    expect(el.querySelector('.withdraw')).toBeNull();
    http.verify();
  });
});

describe('KvkSignups', () => {
  it('a failed list shows its error text instead of breaking', async () => {
    const http = setup();
    const data = TestBed.runInInjectionContext(() => TestBed.inject(KvkApi).signups(() => true));
    const fixture = TestBed.createComponent(KvkSignups);
    fixture.componentRef.setInput('data', data);
    fixture.detectChanges();
    http.expectOne((r) => r.url === '/api/kvk/signups/').flush(null, { status: 502, statusText: 'Bad Gateway' });
    http.match('/api/commanders/marches/').forEach((req) => req.flush([]));
    await flushAll(fixture);
    expect((fixture.nativeElement as HTMLElement).querySelector('.is-error')?.textContent).toBeTruthy();
  });

  it('lists every sign-up as a card, filters by role and lets the superuser withdraw one', async () => {
    const http = setup();
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    const data = TestBed.runInInjectionContext(() => TestBed.inject(KvkApi).signups(() => true));
    const fixture = TestBed.createComponent(KvkSignups);
    fixture.componentRef.setInput('data', data);
    fixture.componentRef.setInput('superuser', true);
    let changed = 0;
    fixture.componentInstance.changed.subscribe(() => changed++);
    fixture.detectChanges();
    const player = { id: 1, name: 'nelly', ingame_name: 'Nelly', avatar_url: '', discord_id: '42' };
    http.expectOne((r) => r.url === '/api/kvk/signups/').flush({
      signups: [
        { ...SIGNUP, player, marches: [{ id: 5, position: 1, kind: 'cavalry', primary: 'Attila', secondary: '', attack: 12, defense: 9, health: 8, damage: 0, gold: 1, blue: 2, white: 3 }] },
        { ...SIGNUP, id: 10, role: 'garrison', kind: 'archer', attack: 8, defense: 7, health: 6, player: { ...player, id: 2, ingame_name: 'Bob' } },
      ],
    });
    http.expectOne('/api/commanders/marches/').flush([{ name: 'Attila', icon: '/static/guides/commanders/attila.webp', pick: true }]);
    await flushAll(fixture);
    http.match('/api/armory/').forEach((r) => r.flush(ARMORY));
    await flushAll(fixture);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.signup').length).toBe(2);
    expect(el.querySelector('.signup__contact')?.getAttribute('href')).toBe('https://discord.com/users/42');
    // closed at first like the players on /marche: the role and the portraits of the commanders only
    expect(el.querySelector('.signup__body')).toBeNull();
    expect(el.querySelector('.signup__preview .signup__mini')?.getAttribute('alt')).toBe('Attila');
    const expand = () => el.querySelector<HTMLButtonElement>('.list__expand')!;
    expect(expand().textContent?.trim()).toBe('Rozbaliť všetky');
    expand().click();
    await flushAll(fixture);
    // the cards of the marches ask for the armory once they are on screen
    http.match('/api/armory/').forEach((r) => r.flush(ARMORY));
    await flushAll(fixture);
    expect(el.querySelectorAll('.signup__body').length).toBe(2);
    expect(el.querySelector('.signup__preview')).toBeNull();
    expect(expand().textContent?.trim()).toBe('Zbaliť všetky');
    // the profile marches as cards, the bonuses of their troop type in the title
    expect(el.querySelector('.mini-marches .mb__primary')?.textContent?.trim()).toBe('Attila');
    el.querySelector<HTMLButtonElement>('.mini-marches .mb__detail')!.click();
    await flushAll(fixture);
    expect(el.querySelector('.mini-marches .mb__stats li')?.getAttribute('title')).toBe('Cav ATK');

    // the troops filter, combined with the role
    const troops = () => [...el.querySelectorAll<HTMLButtonElement>('.list__filter--troops button')];
    expect(troops().map((b) => b.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'Všetci · 2',
      'Pechota · 0',
      'Jazda · 1',
      'Lukostrelci · 1',
    ]);
    troops()[2].click();
    await flushAll(fixture);
    expect(Array.from(el.querySelectorAll('.signup__name'), (n) => n.textContent)).toEqual(['Nelly']);
    troops()[0].click();
    await flushAll(fixture);

    el.querySelectorAll<HTMLButtonElement>('.list__filter button')[2].click();
    await flushAll(fixture);
    expect(Array.from(el.querySelectorAll('.signup__name'), (n) => n.textContent)).toEqual(['Bob']);
    expect(troops().map((b) => b.textContent?.replace(/\s+/g, ' ').trim())[3]).toBe('Lukostrelci · 1');

    // the sign-up is the card of a march: troops, commanders, the bonuses of its troops (no screenshots)
    el.querySelector<HTMLButtonElement>('.signup__army .mb__detail')!.click();
    await flushAll(fixture);
    expect(el.querySelector('.signup__army .mb__kind')?.getAttribute('alt')).toBe('Lukostrelci');
    expect(el.querySelector('.signup__army .mb__stats li')?.getAttribute('title')).toBe('Arch ATK');
    expect(el.querySelector('.signup__army .mb__stats li')?.textContent).toContain('8%');

    // the superuser withdraws it on the second click
    const remove = () => el.querySelector<HTMLButtonElement>('.signup__remove')!;
    remove().click();
    await flushAll(fixture);
    http.expectNone('/api/kvk/signups/10/');
    remove().click();
    http.expectOne((r) => r.method === 'DELETE' && r.url === '/api/kvk/signups/10/').flush(null, { status: 204, statusText: '' });
    await flushAll(fixture);
    expect(changed).toBe(1);
    http.verify();
  });

  it('shows a player signed up for rally and garrison as one card with both sign-ups', async () => {
    const http = setup();
    const data = TestBed.runInInjectionContext(() => TestBed.inject(KvkApi).signups(() => true));
    const fixture = TestBed.createComponent(KvkSignups);
    fixture.componentRef.setInput('data', data);
    fixture.detectChanges();
    const player = { id: 1, name: 'nelly', ingame_name: 'Nelly', avatar_url: '', discord_id: '42' };
    const marches = [{ id: 5, position: 1, kind: 'cavalry' as const, primary: 'Attila', secondary: '' }];
    http.expectOne((r) => r.url === '/api/kvk/signups/').flush({
      signups: [
        { ...SIGNUP, player, marches, note: 'rally note' },
        { ...SIGNUP, id: 11, role: 'garrison', kind: 'archer', player, marches, updated_at: '2026-10-12T08:00:00Z' },
      ],
    });
    http.expectOne('/api/commanders/marches/').flush(COMMANDERS);
    await flushAll(fixture);
    http.match('/api/armory/').forEach((r) => r.flush(ARMORY));
    await flushAll(fixture);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.signup').length).toBe(1);
    expect(el.querySelectorAll('.signup__contact').length).toBe(1);
    // the filters count players (cards), not sign-ups
    expect(el.querySelector('.list__filter button')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Všetci · 1');
    // closed: both roles at a glance; the head opens the card
    expect([...el.querySelectorAll('.signup__preview .tag')].map((t) => t.textContent?.trim())).toEqual(['Rally', 'Garrison']);
    const toggle = el.querySelector<HTMLButtonElement>('.signup__toggle')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    await flushAll(fixture);
    http.match('/api/armory/').forEach((r) => r.flush(ARMORY));
    await flushAll(fixture);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelector(`#${toggle.getAttribute('aria-controls')}`)).not.toBeNull();
    expect(el.querySelectorAll('.signup__marches').length).toBe(1);
    expect([...el.querySelectorAll('.signup__entry .tag:not(.tag--warn)')].map((t) => t.textContent?.trim())).toEqual(['Rally', 'Garrison']);
    // the newest change of the two
    expect(el.querySelector('.signup__meta')?.textContent).toContain('12. 10.');
    // a filter keeps only the matching sign-up in the card
    el.querySelectorAll<HTMLButtonElement>('.list__filter button')[2].click();
    await flushAll(fixture);
    expect([...el.querySelectorAll('.signup__entry .tag:not(.tag--warn)')].map((t) => t.textContent?.trim())).toEqual(['Garrison']);
    http.verify();
  });

  it('filters by commander (primary or secondary) together with the role, and the counts follow it', async () => {
    const http = setup();
    const data = TestBed.runInInjectionContext(() => TestBed.inject(KvkApi).signups(() => true));
    const fixture = TestBed.createComponent(KvkSignups);
    fixture.componentRef.setInput('data', data);
    fixture.detectChanges();
    const player = (id: number, ingame_name: string) => ({ id, name: ingame_name.toLowerCase(), ingame_name, avatar_url: '', discord_id: String(id) });
    http.expectOne((r) => r.url === '/api/kvk/signups/').flush({
      signups: [
        { ...SIGNUP, player: player(1, 'Nelly') },
        { ...SIGNUP, id: 11, role: 'garrison', kind: 'infantry', primary: 'Gorgo', secondary: 'Constantine I', player: player(2, 'Bob') },
        { ...SIGNUP, id: 12, kind: 'archer', primary: 'Yi Seong-Gye', secondary: 'Attila', player: player(3, 'Cara') },
      ],
    });
    http.expectOne('/api/commanders/marches/').flush(COMMANDERS);
    await flushAll(fixture);
    http.match('/api/armory/').forEach((r) => r.flush(ARMORY));
    await flushAll(fixture);
    const el = fixture.nativeElement as HTMLElement;
    const text = (b: Element) => b.textContent?.replace(/\s+/g, ' ').trim();
    const names = () => Array.from(el.querySelectorAll('.signup__name'), (n) => n.textContent);
    const roles = () => [...el.querySelectorAll('.list__filter:not(.list__filter--troops) button')].map(text);
    const troops = () => [...el.querySelectorAll('.list__filter--troops button')].map(text);
    // only the commanders of the sign-ups are offered, alphabetically
    const select = el.querySelector<HTMLSelectElement>('#kvk-commander')!;
    expect(el.querySelector('label[for="kvk-commander"]')?.textContent).toBe('Commander');
    expect([...select.options].map((o) => o.textContent)).toEqual(['Všetci commanderi', 'Attila', 'Constantine I', 'Gorgo', 'Takeda Shingen', 'Yi Seong-Gye']);
    select.value = 'Attila';
    select.dispatchEvent(new Event('change'));
    await flushAll(fixture);
    expect(names()).toEqual(['Nelly', 'Cara']);
    expect(roles()).toEqual(['Všetci · 2', 'Rally · 2', 'Garrison · 0']);
    expect(troops()).toEqual(['Všetci · 2', 'Pechota · 0', 'Jazda · 1', 'Lukostrelci · 1']);
    // with the troops: an archer with Attila
    el.querySelectorAll<HTMLButtonElement>('.list__filter--troops button')[3].click();
    await flushAll(fixture);
    expect(names()).toEqual(['Cara']);
    select.value = '';
    select.dispatchEvent(new Event('change'));
    await flushAll(fixture);
    expect(roles()).toEqual(['Všetci · 3', 'Rally · 2', 'Garrison · 1']);
    http.match('/api/armory/').forEach((r) => r.flush(ARMORY));
    http.verify();
  });

  it('copies exactly the filtered sign-ups as a Discord roster, and shows the text to copy by hand when the clipboard is denied', async () => {
    const http = setup();
    const data = TestBed.runInInjectionContext(() => TestBed.inject(KvkApi).signups(() => true));
    const fixture = TestBed.createComponent(KvkSignups);
    fixture.componentRef.setInput('data', data);
    fixture.detectChanges();
    const player = (id: number, ingame_name: string) => ({ id, name: ingame_name.toLowerCase(), ingame_name, avatar_url: '', discord_id: String(900 + id) });
    http.expectOne((r) => r.url === '/api/kvk/signups/').flush({
      signups: [
        { ...SIGNUP, player: player(1, 'Nelly'), note: 'večer online' },
        { ...SIGNUP, id: 11, kind: 'infantry', primary: 'Gorgo', player: player(2, 'Bob') },
        { ...SIGNUP, id: 12, role: 'garrison', kind: 'cavalry', player: player(3, 'Cara') },
      ],
    });
    http.expectOne('/api/commanders/marches/').flush(COMMANDERS);
    await flushAll(fixture);
    http.match('/api/armory/').forEach((r) => r.flush(ARMORY));
    await flushAll(fixture);
    const el = fixture.nativeElement as HTMLElement;
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    try {
      // Rally + Jazda
      el.querySelectorAll<HTMLButtonElement>('.list__filter:not(.list__filter--troops) button')[1].click();
      el.querySelectorAll<HTMLButtonElement>('.list__filter--troops button')[2].click();
      await flushAll(fixture);
      const copy = () => el.querySelector<HTMLButtonElement>('.list__copy button')!;
      expect(el.querySelectorAll('.list__copy button').length).toBe(1);
      expect(copy().textContent?.trim()).toBe('Kopírovať pre Discord');
      copy().click();
      expect(writeText).toHaveBeenCalledWith('**Rally (1)**\n__Jazda__\n• Nelly – Attila / Takeda Shingen');
      await flushAll(fixture);
      expect(el.querySelector('.list__copied[role="status"]')?.textContent?.trim()).toBe('Skopírované – vlož to do Discordu.');
      expect(el.querySelector('.list__manual')).toBeNull();

      // denied: the text in a readonly field with the focus
      writeText.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
      el.querySelectorAll<HTMLButtonElement>('.list__filter:not(.list__filter--troops) button')[0].click();
      await flushAll(fixture);
      copy().click();
      await flushAll(fixture);
      const field = el.querySelector<HTMLTextAreaElement>('.list__manual textarea')!;
      expect(field.readOnly).toBe(true);
      expect(field.value).toContain('**Rally (1)**\n__Jazda__\n• Nelly');
      expect(field.value).toContain('**Garrison (1)**\n__Jazda__\n• Cara');
      expect(field.value).not.toContain('Bob');
      expect(field.value).not.toContain('večer');
      expect(document.activeElement).toBe(field);
      expect(el.querySelector('.list__copied')?.textContent?.trim()).toBe('');
      expect(el.querySelector('.list__manual .field__label')?.textContent).toContain('Kopírovanie nefunguje');
    } finally {
      delete (navigator as { clipboard?: unknown }).clipboard;
    }
    http.verify();
  });
});

describe('KvkPage', () => {
  it('keeps the form on screen after a sign-up changes (no reload of the whole tab)', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        // no parallax in the page header
        { provide: Scroll, useValue: { scrolled: signal(false), reducedMotion: true } },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(KvkPage);
    const user = { discord_id: '1', name: 'Nelly', avatar_url: '', ingame_name: 'Nelly', approved: true, terms_accepted: true, is_staff: false, is_superuser: false };
    const answers: Record<string, unknown> = {
      '/api/auth/me/': { login_enabled: true, user },
      '/api/kvk/': { ...STATE, reviewer: true },
      '/api/kvk/signups/': { signups: [] },
      '/api/commanders/marches/': COMMANDERS,
    };
    const requested: string[] = [];
    // answers every pending request (several rounds: a request can start once another one is answered)
    const settle = async () => {
      for (let round = 0; round < 5; round++) {
        fixture.detectChanges();
        TestBed.tick();
        for (const req of http.match(() => true)) {
          requested.push(req.request.url);
          req.flush(answers[req.request.url] ?? []);
        }
        await new Promise((resolve) => setTimeout(resolve));
      }
    };
    await settle();
    const form = fixture.debugElement.query(By.directive(KvkForm));
    expect(form).not.toBeNull();
    expect(requested.filter((url) => url === '/api/kvk/').length).toBe(1);

    // the first sign-up: only the reviewers' list asks again, the form stays the same instance
    requested.length = 0;
    form.componentInstance.changed.emit();
    await settle();
    expect(requested).toEqual(['/api/kvk/signups/']);
    expect(fixture.debugElement.query(By.directive(KvkForm)).componentInstance).toBe(form.componentInstance);
  });

  it('offers "Kopírovať pre Discord" only on the list of the reviewers, never to a player', async () => {
    const open = async (reviewer: boolean) => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideRouter([]),
          provideHttpClient(),
          provideHttpClientTesting(),
          { provide: Scroll, useValue: { scrolled: signal(false), reducedMotion: true } },
        ],
      });
      const http = TestBed.inject(HttpTestingController);
      const fixture = TestBed.createComponent(KvkPage);
      const user = { discord_id: '1', name: 'Nelly', avatar_url: '', ingame_name: 'Nelly', approved: true, terms_accepted: true, is_staff: false, is_superuser: false };
      const answers: Record<string, unknown> = {
        '/api/auth/me/': { login_enabled: true, user },
        '/api/kvk/': { ...STATE, reviewer },
        '/api/kvk/signups/': { signups: [{ ...SIGNUP, player: { id: 2, name: 'bob', ingame_name: 'Bob', avatar_url: '', discord_id: '2' } }] },
        '/api/commanders/marches/': COMMANDERS,
        '/api/armory/': ARMORY,
      };
      const requested: string[] = [];
      const settle = async () => {
        for (let round = 0; round < 5; round++) {
          fixture.detectChanges();
          TestBed.tick();
          for (const req of http.match(() => true)) {
            requested.push(req.request.url);
            req.flush(answers[req.request.url] ?? []);
          }
          await new Promise((resolve) => setTimeout(resolve));
        }
      };
      await settle();
      const el = fixture.nativeElement as HTMLElement;
      // the reviewers open the list
      el.querySelectorAll<HTMLButtonElement>('.kvk-tabs button')[1]?.click();
      await settle();
      return { el, requested };
    };

    const player = await open(false);
    expect(player.el.querySelector('.kvk-tabs')).toBeNull();
    expect(player.el.querySelector('app-kvk-signups')).toBeNull();
    expect(player.el.querySelector('.list__copy')).toBeNull();
    expect(player.requested).not.toContain('/api/kvk/signups/');

    const r4 = await open(true);
    expect(r4.el.querySelector('.list__copy button')?.textContent?.trim()).toBe('Kopírovať pre Discord');
  });
});

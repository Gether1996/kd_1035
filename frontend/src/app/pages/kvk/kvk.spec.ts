import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { KvkApi, KvkSignup, KvkState } from '../../core/kvk-api';
import { Scroll } from '../../core/scroll';
import { KvkForm } from './kvk-form';
import { KvkPage } from './kvk-page';
import { KvkSignups } from './kvk-signups';

const STATE: KvkState = {
  title_sk: '20.11. najbližšie KvK',
  title_cs: '',
  signups: { rally: null, garrison: null },
  player: true,
  ingame_name: 'Nelly',
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
  updated_at: '2026-10-11T11:00:00Z',
  images: [{ id: 1, kind: 'equipment', url: '/api/kvk/images/1/', thumb: '/api/kvk/images/1/?thumb=1', width: 1, height: 1 }],
  complete: false,
};
const COMMANDERS = [
  { name: 'Attila', icon: '/static/guides/commanders/attila.webp', pick: true },
  { name: 'Takeda Shingen', icon: '/static/guides/commanders/takeda-shingen.webp', pick: true },
];
const image = (id: number, kind: string) => ({ id, kind, url: `/api/kvk/images/${id}/`, thumb: `/api/kvk/images/${id}/?thumb=1`, width: 1, height: 1 });

function setup() {
  TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
  return TestBed.inject(HttpTestingController);
}

const flushAll = async (fixture: { whenStable(): Promise<unknown> }) => {
  await fixture.whenStable();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
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

  it('is filled in like a march: commanders and both screenshots, sent only with "Prihlásiť sa"', async () => {
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
    // the heading set by the superuser
    expect(el.querySelector('#kvk-form-title')?.textContent).toContain('20.11. najbližšie KvK');
    // cavalry, infantry or archers – the bonuses are read as theirs
    expect(el.querySelectorAll('.kind').length).toBe(3);
    expect(el.querySelector('.stat-field__label')?.textContent?.trim()).toBe('ATK');

    // rally first; garrison is a second sign-up with its own army
    expect([...el.querySelectorAll('.role-tabs button')].map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    submit();
    await fixture.whenStable();
    expect(state()).toContain('Vyber typ marchu.');
    el.querySelectorAll<HTMLButtonElement>('.kind')[1].click();
    await fixture.whenStable();
    expect(el.querySelector('.stat-field__label')?.textContent?.trim()).toBe('Cav ATK');
    submit();
    await fixture.whenStable();
    expect(state()).toContain('Vyber primárneho commandera.');

    el.querySelector<HTMLButtonElement>('.tile')!.click();
    await fixture.whenStable();
    el.querySelector<HTMLButtonElement>('.picker-tile')!.click();
    await fixture.whenStable();
    submit();
    await fixture.whenStable();
    expect(state()).toContain('Pridaj screenshot výbavy.');
    http.expectNone('/api/kvk/signup/');

    const pickFile = async (name: string) => {
      const input = el.querySelector<HTMLInputElement>('input[type="file"]')!;
      Object.defineProperty(input, 'files', { value: [new File(['x'], name, { type: 'image/png' })] });
      input.dispatchEvent(new Event('change'));
      await fixture.whenStable();
    };
    await pickFile('equipment.png');
    await pickFile('armaments.png');
    const stat = el.querySelector<HTMLInputElement>('.stat-field__input')!;
    stat.value = '9';
    stat.dispatchEvent(new Event('input'));
    submit();
    const req = http.expectOne('/api/kvk/signup/');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({
      ingame_name: 'Nelly',
      role: 'rally',
      kind: 'cavalry',
      primary: 'Attila',
      secondary: '',
      attack: 9,
      defense: null,
      health: null,
      damage: null,
      gold: null,
      blue: null,
      white: null,
      note: '',
    });
    req.flush({ ...SIGNUP, secondary: '', attack: 9, images: [] });
    await flushAll(fixture);
    http.expectOne('/api/kvk/signup/images/').flush(image(7, 'equipment'));
    await flushAll(fixture);
    const second = http.expectOne('/api/kvk/signup/images/');
    expect((second.request.body as FormData).get('kind')).toBe('armaments');
    expect((second.request.body as FormData).get('role')).toBe('rally');
    second.flush(image(8, 'armaments'));
    await flushAll(fixture);
    expect(el.querySelector('.badge')?.textContent).toContain('Kompletná');
    expect(state()).toContain('Uložené');
    // the rally tab is marked as sent; the garrison tab starts empty
    expect(el.querySelector('.role-tabs button .role-tabs__done')).not.toBeNull();
    el.querySelectorAll<HTMLButtonElement>('.role-tabs button')[1].click();
    await fixture.whenStable();
    expect(el.querySelector('.tile__caption')?.textContent?.trim()).toBe('Primárny');
    expect(el.querySelector('.badge')).toBeNull();
    http.verify();
  });

  it('says why an upload was refused and keeps the chosen file', async () => {
    const http = setup();
    const fixture = TestBed.createComponent(KvkForm);
    fixture.componentRef.setInput('state', { ...STATE, signups: { rally: null, garrison: { ...SIGNUP, role: 'garrison' } } });
    fixture.detectChanges();
    http.expectOne('/api/commanders/marches/').flush(COMMANDERS);
    http.expectOne('/api/auth/me/').flush({ login_enabled: true, user: null });
    await flushAll(fixture);
    const el = fixture.nativeElement as HTMLElement;
    // the saved garrison sign-up opens its tab and fills the form: its commanders and its equipment screenshot
    expect(el.querySelector('.role-tabs button[aria-pressed="true"]')?.textContent).toContain('Garrison');
    expect([...el.querySelectorAll('.tile__caption')].map((c) => c.textContent?.trim()).slice(0, 2)).toEqual(['Attila', 'Takeda Shingen']);
    expect(el.querySelectorAll('.tile__box--shot img').length).toBe(1);

    const input = el.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'a.txt', { type: 'text/plain' })] });
    input.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    el.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    http.expectOne('/api/kvk/signup/').flush(SIGNUP);
    await flushAll(fixture);
    const req = http.expectOne('/api/kvk/signup/images/');
    expect((req.request.body as FormData).get('kind')).toBe('armaments');
    req.flush({ detail: 'not_image' }, { status: 400, statusText: 'Bad Request' });
    await flushAll(fixture);
    expect(el.querySelector('.block__error')?.textContent).toContain('nie je obrázok');
    expect(el.querySelectorAll('.tile__box--shot img').length).toBe(2);
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
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.role-tabs__done').length).toBe(2);

    const buttons = () => Array.from(el.querySelectorAll<HTMLButtonElement>('.withdraw button'));
    buttons()[0].click();
    await fixture.whenStable();
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

  it('lists every sign-up, filters by role, opens a screenshot and lets the superuser withdraw one', async () => {
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
        { ...SIGNUP, player, marches: [{ id: 5, position: 1, kind: 'cavalry', primary: 'Attila', secondary: '', images: [], attack: 12, defense: 9, health: 8, damage: 0, gold: 1, blue: 2, white: 3 }] },
        { ...SIGNUP, id: 10, role: 'garrison', kind: 'archer', attack: 8, player: { ...player, id: 2, ingame_name: 'Bob' } },
      ],
    });
    http.expectOne('/api/commanders/marches/').flush([{ name: 'Attila', icon: '/static/guides/commanders/attila.webp', pick: true }]);
    await flushAll(fixture);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.signup').length).toBe(2);
    expect(el.querySelector('.signup__contact')?.getAttribute('href')).toBe('https://discord.com/users/42');
    // the march as a row of portraits, the bonuses of its troop type below
    expect(el.querySelector('.mini-march .mrow__head')?.getAttribute('alt')).toBe('Attila');
    expect(el.querySelector('.mini-march .mrow__stats')?.textContent).toContain('Cav ATK 12%');

    // the troops filter, combined with the role
    const troops = () => [...el.querySelectorAll<HTMLButtonElement>('.list__filter--troops button')];
    expect(troops().map((b) => b.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'Všetci · 2',
      'Pechota · 0',
      'Jazda · 1',
      'Lukostrelci · 1',
    ]);
    troops()[2].click();
    await fixture.whenStable();
    expect(Array.from(el.querySelectorAll('.signup__name'), (n) => n.textContent)).toEqual(['Nelly']);
    troops()[0].click();
    await fixture.whenStable();

    el.querySelectorAll<HTMLButtonElement>('.list__filter button')[2].click();
    await fixture.whenStable();
    expect(Array.from(el.querySelectorAll('.signup__name'), (n) => n.textContent)).toEqual(['Bob']);
    expect(troops().map((b) => b.textContent?.replace(/\s+/g, ' ').trim())[3]).toBe('Lukostrelci · 1');

    // the sign-up is a row like a march: troops icon, heads, screenshots, bonuses of its troops
    expect(el.querySelector('.signup__army .mrow__kind')?.getAttribute('alt')).toBe('Lukostrelci');
    expect(el.querySelector('.signup__army .mrow__stats')?.textContent).toContain('Arch ATK 8%');
    el.querySelector<HTMLButtonElement>('.signup__army .mrow__shot')!.click();
    await fixture.whenStable();
    // it opens in a dialog on the page, not a new page
    expect(el.querySelector('dialog[open] .viewer__img')?.getAttribute('src')).toBe('/api/kvk/images/1/');

    // the superuser withdraws it on the second click
    const remove = () => el.querySelector<HTMLButtonElement>('.signup__remove')!;
    remove().click();
    await fixture.whenStable();
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
    const marches = [{ id: 5, position: 1, kind: 'cavalry' as const, primary: 'Attila', secondary: '', images: [] }];
    http.expectOne((r) => r.url === '/api/kvk/signups/').flush({
      signups: [
        { ...SIGNUP, player, marches, note: 'rally note' },
        { ...SIGNUP, id: 11, role: 'garrison', kind: 'archer', player, marches, updated_at: '2026-10-12T08:00:00Z' },
      ],
    });
    http.expectOne('/api/commanders/marches/').flush(COMMANDERS);
    await flushAll(fixture);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.signup').length).toBe(1);
    expect(el.querySelectorAll('.signup__contact').length).toBe(1);
    // the filters count players (cards), not sign-ups
    expect(el.querySelector('.list__filter button')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Všetci · 1');
    expect(el.querySelectorAll('.signup__marches').length).toBe(1);
    expect([...el.querySelectorAll('.signup__entry .tag:not(.tag--warn)')].map((t) => t.textContent?.trim())).toEqual(['Rally', 'Garrison']);
    // the newest change of the two
    expect(el.querySelector('.signup__meta')?.textContent).toContain('12. 10.');
    // a filter keeps only the matching sign-up in the card
    el.querySelectorAll<HTMLButtonElement>('.list__filter button')[2].click();
    await fixture.whenStable();
    expect([...el.querySelectorAll('.signup__entry .tag:not(.tag--warn)')].map((t) => t.textContent?.trim())).toEqual(['Garrison']);
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
    const user = { discord_id: '1', name: 'Nelly', avatar_url: '', ingame_name: 'Nelly', is_staff: false, is_superuser: false };
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
});

import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { KvkRound, KvkSignup, KvkState } from '../../core/kvk-api';
import { KvkForm } from './kvk-form';
import { KvkSignups } from './kvk-signups';

const ROUND: KvkRound = {
  id: 3,
  title_sk: 'KvK 3',
  title_cs: '',
  is_open: true,
  created_at: '2026-10-11T10:00:00Z',
  closed_at: null,
};
const STATE: KvkState = {
  round: ROUND,
  signup: null,
  older: [],
  player: true,
  ingame_name: 'Nelly',
  reviewer: false,
  superuser: false,
};
const SIGNUP: KvkSignup = {
  id: 9,
  round: 3,
  rally: true,
  garrison: false,
  commanders: 'Attila + Takeda Shingen',
  note: '',
  updated_at: '2026-10-11T11:00:00Z',
  images: [{ id: 1, kind: 'vip', url: '/api/kvk/images/1/', thumb: '/api/kvk/images/1/?thumb=1', width: 1, height: 1 }],
  complete: false,
};

function setup() {
  TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
  return TestBed.inject(HttpTestingController);
}

const flushAll = async (fixture: { whenStable(): Promise<unknown> }) => {
  await fixture.whenStable();
  await fixture.whenStable();
};

describe('KvkForm', () => {
  it('needs a role, saves the sign-up and then offers the screenshots', async () => {
    const http = setup();
    const fixture = TestBed.createComponent(KvkForm);
    fixture.componentRef.setInput('state', STATE);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector<HTMLInputElement>('#kvk-name')!.value).toBe('Nelly');
    expect(el.querySelector('.shots')).toBeNull();

    el.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(el.querySelector('.form__state')?.textContent).toContain('Vyber rally');

    el.querySelector<HTMLInputElement>('.chip input')!.click();
    el.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    const req = http.expectOne('/api/kvk/signup/');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ ingame_name: 'Nelly', rally: true, garrison: false, commanders: '', note: '' });
    req.flush({ ...SIGNUP, images: [] });
    await flushAll(fixture);
    expect(el.querySelectorAll('.shot-group').length).toBe(4);
    expect(el.querySelector('.badge')?.textContent).toContain('Chýbajú screenshoty');
    http.verify();
  });

  it('says why an upload was refused', async () => {
    const http = setup();
    const fixture = TestBed.createComponent(KvkForm);
    fixture.componentRef.setInput('state', { ...STATE, signup: SIGNUP });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.thumb img').length).toBe(1);

    const input = el.querySelectorAll<HTMLInputElement>('input[type="file"]')[1];
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'a.txt', { type: 'text/plain' })] });
    input.dispatchEvent(new Event('change'));
    const req = http.expectOne('/api/kvk/signup/images/');
    expect((req.request.body as FormData).get('kind')).toBe('equipment');
    req.flush({ detail: 'not_image' }, { status: 400, statusText: 'Bad Request' });
    await flushAll(fixture);
    expect(el.querySelector('.shot-group__error')?.textContent).toContain('nie je obrázok');
    http.verify();
  });

  it('shows a sign-up of a closed round next to the open one; it can still be withdrawn', async () => {
    const http = setup();
    const fixture = TestBed.createComponent(KvkForm);
    fixture.componentRef.setInput('state', {
      ...STATE,
      round: { ...ROUND, id: 4, title_sk: 'KvK 4' },
      older: [{ round: { ...ROUND, is_open: false }, signup: SIGNUP }],
    });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    // the new form starts empty, the old sign-up has its own panel
    expect(el.querySelector('.chip input:checked')).toBeNull();
    expect(el.textContent).toContain('Prihlasovanie je uzavreté, vedenie tvoju prihlášku stále vidí');

    const buttons = () => Array.from(el.querySelectorAll<HTMLButtonElement>('.withdraw button'));
    buttons()[0].click();
    await fixture.whenStable();
    buttons()[0].click();
    const req = http.expectOne((r) => r.method === 'DELETE' && r.url === '/api/kvk/signup/');
    expect(req.request.params.get('round')).toBe('3');
    req.flush(null, { status: 204, statusText: '' });
    await flushAll(fixture);
    expect(el.querySelector('.thumb')).toBeNull();
    http.verify();
  });
});

describe('KvkSignups', () => {
  it('lists the sign-ups of the open round, filters by role and opens a screenshot', async () => {
    const http = setup();
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    const fixture = TestBed.createComponent(KvkSignups);
    fixture.componentRef.setInput('rounds', [ROUND, { ...ROUND, id: 2, title_sk: 'KvK 2', is_open: false }]);
    fixture.detectChanges();
    const player = { id: 1, name: 'nelly', ingame_name: 'Nelly', avatar_url: '', discord_id: '42' };
    http.expectOne('/api/kvk/rounds/3/signups/').flush({
      round: ROUND,
      signups: [
        { ...SIGNUP, player, marches: [{ id: 5, position: 1, kind: 'cavalry', primary: 'Attila', secondary: '', images: [] }] },
        { ...SIGNUP, id: 10, rally: false, garrison: true, player: { ...player, id: 2, ingame_name: 'Bob' } },
      ],
    });
    await flushAll(fixture);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.signup').length).toBe(2);
    expect(el.querySelector('.signup__contact')?.getAttribute('href')).toBe('https://discord.com/users/42');
    expect(el.querySelector('.mini-march__pair')?.textContent).toContain('Attila');

    el.querySelectorAll<HTMLButtonElement>('.list__filter button')[2].click();
    await fixture.whenStable();
    expect(Array.from(el.querySelectorAll('.signup__name'), (n) => n.textContent)).toEqual(['Bob']);

    el.querySelector<HTMLButtonElement>('.signup__thumb')!.click();
    await fixture.whenStable();
    expect(el.querySelector('.viewer__image img')?.getAttribute('src')).toBe('/api/kvk/images/1/');
    http.verify();
  });
});

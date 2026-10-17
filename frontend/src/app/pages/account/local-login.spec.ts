import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Me, Player } from '../../core/auth';
import { Scroll } from '../../core/scroll';
import { Account } from './account';

const LOCAL: Player = {
  discord_id: null,
  local: true,
  name: 'Ľubo',
  avatar_url: '/img/avatar-local.svg',
  ingame_name: 'Ľubo',
  power: 100,
  approved: true,
  terms_accepted: true,
  is_staff: false,
  is_superuser: false,
};

describe('Signing in without Discord', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: Scroll, useValue: { scrolled: signal(false), reducedMotion: true } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  async function settle() {
    TestBed.tick();
    await new Promise((resolve) => setTimeout(resolve));
    TestBed.tick();
  }

  async function render(me: Me) {
    const fixture = TestBed.createComponent(Account);
    fixture.detectChanges();
    http.expectOne('/api/auth/me/').flush(me);
    await settle();
    http.match((req) => !req.url.startsWith('/api/auth/')).forEach((req) => req.flush('down', { status: 500, statusText: 'Server Error' }));
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const type = (el: HTMLElement, selector: string, value: string) => {
    const input = el.querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };

  const button = (el: HTMLElement, text: string) =>
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === text)!;

  async function submit(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }, el: HTMLElement) {
    el.querySelector<HTMLFormElement>('.local__form')!.dispatchEvent(new Event('submit'));
    await settle();
  }

  it('offers Discord and the form without Discord', async () => {
    const { el } = await render({ login_enabled: true, discord_login: true, signup_open: true, user: null });
    expect(el.querySelector('a[href^="/api/auth/discord/login/"]')).not.toBeNull();
    expect(el.querySelector('.local__or')?.textContent).toContain('alebo bez Discordu');
    expect(el.querySelector('#local-password')?.getAttribute('autocomplete')).toBe('current-password');
  });

  it('only the form when Discord is not set up on the server', async () => {
    const { el } = await render({ login_enabled: true, discord_login: false, signup_open: true, user: null });
    expect(el.querySelector('a[href^="/api/auth/discord/login/"]')).toBeNull();
    expect(el.querySelector('.local__form')).not.toBeNull();
  });

  it('signs up with the hidden field and the time the form was open', async () => {
    const { fixture, el } = await render({ login_enabled: true, discord_login: true, signup_open: true, user: null });
    button(el, 'Nový účet').click();
    fixture.detectChanges();
    expect(el.querySelector('#local-password')?.getAttribute('autocomplete')).toBe('new-password');
    type(el, '#local-name', 'Ľubo');
    type(el, '#local-password', 'Kral0vstvo-1035');
    await submit(fixture, el);
    const req = http.expectOne('/api/auth/local/signup/');
    expect(req.request.body).toEqual(expect.objectContaining({ name: 'Ľubo', password: 'Kral0vstvo-1035', website: '', lang: 'sk' }));
    expect(typeof req.request.body.elapsed).toBe('number');
    req.flush({ login_enabled: true, user: { ...LOCAL, approved: false } }, { status: 201, statusText: 'Created' });
    await settle();
    fixture.detectChanges();
    expect(el.querySelector('#account-name')?.textContent).toContain('Ľubo');
  });

  it('says why the password is refused, and a wrong sign-in in one sentence', async () => {
    const { fixture, el } = await render({ login_enabled: true, discord_login: true, signup_open: true, user: null });
    type(el, '#local-name', 'Ľubo');
    type(el, '#local-password', 'wrong');
    await submit(fixture, el);
    http.expectOne('/api/auth/local/login/').flush({ detail: 'invalid' }, { status: 400, statusText: 'Bad Request' });
    await settle();
    fixture.detectChanges();
    expect(el.querySelector('.local__state')?.textContent).toContain('Nesprávne meno v hre alebo heslo.');

    button(el, 'Nový účet').click();
    fixture.detectChanges();
    type(el, '#local-name', 'Ľubo');
    type(el, '#local-password', '1234');
    await submit(fixture, el);
    http
      .expectOne('/api/auth/local/signup/')
      .flush({ detail: 'password', errors: ['password_entirely_numeric', 'password_too_short'] }, { status: 400, statusText: 'Bad Request' });
    await settle();
    fixture.detectChanges();
    const text = el.querySelector('.local__state')?.textContent ?? '';
    expect(text).toContain('Heslo nesmie byť iba z číslic.');
    expect(text).toContain('Heslo musí mať aspoň 8 znakov.');
  });

  it('asks for the empty fields before sending anything', async () => {
    const { fixture, el } = await render({ login_enabled: true, discord_login: true, signup_open: true, user: null });
    await submit(fixture, el);
    fixture.detectChanges();
    http.expectNone('/api/auth/local/login/');
    expect(el.querySelector('.local__state')?.textContent).toContain('Vyplň všetky polia.');
  });

  it('a full sign-up says so instead of the form', async () => {
    const { fixture, el } = await render({ login_enabled: true, discord_login: true, signup_open: false, user: null });
    button(el, 'Nový účet').click();
    fixture.detectChanges();
    expect(el.querySelector('.local__form')).toBeNull();
    expect(el.textContent).toContain('Registrácia bez Discordu je teraz plná');
  });

  it('a new password with the code from leadership', async () => {
    const { fixture, el } = await render({ login_enabled: true, discord_login: true, signup_open: true, user: null });
    button(el, 'Zabudol si heslo?').click();
    fixture.detectChanges();
    type(el, '#local-name', 'Ľubo');
    type(el, '#local-code', 'ABCD-EFGH');
    type(el, '#local-password', 'Nove-heslo-77');
    await submit(fixture, el);
    const req = http.expectOne('/api/auth/local/reset/');
    expect(req.request.body).toEqual({ name: 'Ľubo', code: 'ABCD-EFGH', password: 'Nove-heslo-77' });
  });

  it('signed in without Discord: the password, the link to Discord, no reminders', async () => {
    const { el } = await render({ login_enabled: true, discord_login: true, signup_open: true, user: LOCAL });
    expect(el.querySelector('.card__meta')?.textContent).toContain('Účet bez Discordu');
    expect(el.querySelector('.password__toggle')?.textContent).toContain('Zmeniť heslo');
    expect(el.querySelector('.link-discord a')?.getAttribute('href')).toBe('/api/auth/discord/login/?link=1&next=%2Fucet');
    expect(el.querySelector('a[href="/pripomienky"]')).toBeNull();
  });

  it('the language of the website and the messages: saved, the page goes on in it', async () => {
    const { fixture, el } = await render({ login_enabled: true, discord_login: true, user: { ...LOCAL, lang: 'sk' } });
    const router = TestBed.inject(Router);
    const go = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const pressed = () => el.querySelector('.ingame--lang [aria-pressed="true"]')?.textContent?.trim();
    expect(pressed()).toBe('Slovenčina');
    button(el, 'Čeština').click();
    const req = http.expectOne('/api/auth/me/');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ lang: 'cs' });
    req.flush({ login_enabled: true, user: { ...LOCAL, lang: 'cs' } });
    await settle();
    fixture.detectChanges();
    expect(pressed()).toBe('Čeština');
    expect(go).toHaveBeenCalledWith('/cz/ucet', { replaceUrl: true });
    expect(localStorage.getItem('kd1035.lang')).toBe('cs');
    localStorage.removeItem('kd1035.lang');
  });
});

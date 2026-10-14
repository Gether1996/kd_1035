import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Me } from '../../core/auth';
import { Scroll } from '../../core/scroll';
import { Account } from './account';

describe('Account', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        // no parallax in the page header
        { provide: Scroll, useValue: { scrolled: signal(false), reducedMotion: true } },
      ],
    });
  });

  /** the signed-in player is known a moment after /api/auth/me/ answers, then the own marches are asked for */
  async function settle() {
    TestBed.tick();
    await new Promise((resolve) => setTimeout(resolve));
    TestBed.tick();
  }

  async function render(me: Me, next?: string) {
    const fixture = TestBed.createComponent(Account);
    if (next) fixture.componentRef.setInput('next', next);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne('/api/auth/me/').flush(me);
    // admin content for SEO (links) and the own marches (once the player is known) are not under test
    await settle();
    http.match(() => true).forEach((req) => req.flush('down', { status: 500, statusText: 'Server Error' }));
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const privacyLink = (el: HTMLElement) => el.querySelector('.card__privacy');

  it('links the login card to the privacy page', async () => {
    const el = await render({ login_enabled: true, user: null });
    expect(el.querySelector('#account-login')).not.toBeNull();
    expect(privacyLink(el)?.getAttribute('href')).toBe('/ochrana-udajov');
    expect(privacyLink(el)?.textContent).toContain('Čo o tebe ukladáme');
  });

  it('links the signed-in card to the privacy page', async () => {
    const el = await render({
      login_enabled: true,
      user: { discord_id: '1', name: 'Nelly', avatar_url: '', ingame_name: '', approved: true, terms_accepted: true, is_staff: false, is_superuser: false },
    });
    expect(el.querySelector('#account-name')?.textContent).toContain('Nelly');
    expect(privacyLink(el)?.getAttribute('href')).toBe('/ochrana-udajov');
    // the reminders have their own page
    expect(el.querySelector('.shortcut')?.getAttribute('href')).toBe('/pripomienky');
  });

  it('counts the own marches the evaluation does not like on the Moje marche shortcut', async () => {
    const fixture = TestBed.createComponent(Account);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne('/api/auth/me/').flush({
      login_enabled: true,
      user: { discord_id: '1', name: 'Nelly', avatar_url: '', ingame_name: 'Nelly', approved: true, terms_accepted: true, is_staff: false, is_superuser: false },
    });
    await settle();
    const march = { position: 1, kind: 'cavalry', primary: 'Attila', secondary: '' };
    http.expectOne('/api/me/marches/').flush({
      marches: [
        { ...march, id: 1, pair_problem: 'solo' },
        { ...march, id: 2, secondary: 'Takeda Shingen', pair_problem: null, formation_problem: [] },
        { ...march, id: 3, secondary: 'Takeda Shingen', formation_problem: ['Wedge'] },
      ],
      max: 10,
      public: false,
    });
    http.match(() => true).forEach((req) => req.flush('down', { status: 500, statusText: 'Server Error' }));
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    // the count, and for a screen reader what it means
    expect(el.querySelector('.shortcut__issues')?.textContent?.trim()).toBe('2 na opravu');
    expect(el.querySelector('.shortcut__issues .sr-only')?.textContent?.trim()).toBe('na opravu');
  });

  it('leaves the marches out for a player who is not approved (Gether 14. 10. 2026)', async () => {
    const fixture = TestBed.createComponent(Account);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne('/api/auth/me/').flush({
      login_enabled: true,
      user: { discord_id: '1', name: 'Nelly', avatar_url: '', ingame_name: 'Nelly', approved: false, terms_accepted: true, is_staff: false, is_superuser: false },
    });
    await settle();
    http.expectNone('/api/me/marches/');
    http.match(() => true).forEach((req) => req.flush('down', { status: 500, statusText: 'Server Error' }));
    await fixture.whenStable();
    const links = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.shortcut'), (a) => a.getAttribute('href'));
    expect(links.some((href) => href?.startsWith('/marche'))).toBe(false);
  });

  it('shows no count when the marches cannot be loaded', async () => {
    // render() answers every other request with an error
    const el = await render({
      login_enabled: true,
      user: { discord_id: '1', name: 'Nelly', avatar_url: '', ingame_name: 'Nelly', approved: true, terms_accepted: true, is_staff: false, is_superuser: false },
    });
    expect(el.querySelector('.shortcut__issues')).toBeNull();
  });

  it('asks for the in-game name first and then goes on to the page the player came for', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const user = { discord_id: '1', name: 'Nelly', avatar_url: '', ingame_name: '', approved: true, terms_accepted: true, is_staff: false, is_superuser: false };
    const el = await render({ login_enabled: true, user }, '/kalendar');
    const input = el.querySelector<HTMLInputElement>('#ingame-name')!;
    expect(el.querySelector('.ingame__ask')?.textContent).toContain('Najprv si nastav meno v hre');
    expect(input.getAttribute('aria-required')).toBe('true');
    expect(document.activeElement).toBe(input);

    // an empty name is not sent
    el.querySelector<HTMLFormElement>('form.ingame')!.dispatchEvent(new Event('submit'));
    const http = TestBed.inject(HttpTestingController);
    http.expectNone('/api/auth/me/');

    input.value = ' Nelly ';
    el.querySelector<HTMLFormElement>('form.ingame')!.dispatchEvent(new Event('submit'));
    const req = http.expectOne((r) => r.method === 'PATCH' && r.url === '/api/auth/me/');
    expect(req.request.body).toEqual({ ingame_name: 'Nelly' });
    req.flush({ login_enabled: true, user: { ...user, ingame_name: 'Nelly' } });
    await new Promise((resolve) => setTimeout(resolve));
    expect(navigate).toHaveBeenCalledWith('/kalendar');
  });

  it('does not send an empty in-game name – it can be changed, not cleared', async () => {
    const user = { discord_id: '1', name: 'Nelly', avatar_url: '', ingame_name: 'Nelly', approved: true, terms_accepted: true, is_staff: false, is_superuser: false };
    const el = await render({ login_enabled: true, user });
    const input = el.querySelector<HTMLInputElement>('#ingame-name')!;
    input.value = '  ';
    el.querySelector<HTMLFormElement>('form.ingame')!.dispatchEvent(new Event('submit'));
    TestBed.inject(HttpTestingController).expectNone((r) => r.method === 'PATCH');
    await new Promise((resolve) => setTimeout(resolve));
    expect(input.value).toBe('Nelly');
    expect(el.querySelector('#ingame-state')?.textContent).toContain('Najprv si nastav meno v hre');
  });

  it('shows the power of the evaluation and saves millions or the whole number from the game', async () => {
    const user = { discord_id: '1', name: 'Nelly', avatar_url: '', ingame_name: 'Nelly', power: 98.4, approved: true, terms_accepted: true, is_staff: false, is_superuser: false };
    const el = await render({ login_enabled: true, user });
    const input = el.querySelector<HTMLInputElement>('#account-power')!;
    expect(input.value).toBe('98,4');
    const http = TestBed.inject(HttpTestingController);
    const form = el.querySelector<HTMLFormElement>('form.ingame--power')!;

    input.value = '101 500 000';
    form.dispatchEvent(new Event('submit'));
    const req = http.expectOne((r) => r.method === 'PATCH');
    expect(req.request.body).toEqual({ power: 101.5 });
    req.flush({ login_enabled: true, user: { ...user, power: 101.5 } });
    await new Promise((resolve) => setTimeout(resolve));
    expect(input.value).toBe('101,5');
    expect(el.querySelector('#power-state')?.textContent).toContain('Uložené');

    // not a power: nothing is sent; empty clears it
    input.value = 'veľa';
    form.dispatchEvent(new Event('submit'));
    http.expectNone((r) => r.method === 'PATCH');
    await new Promise((resolve) => setTimeout(resolve));
    expect(el.querySelector('#power-state')?.textContent).toContain('Zadaj power v miliónoch');
    input.value = '';
    form.dispatchEvent(new Event('submit'));
    const clear = http.expectOne((r) => r.method === 'PATCH');
    expect(clear.request.body).toEqual({ power: null });
    expect(form.querySelector('.ingame__ask')).toBeNull();
    // no power: the same reminder as a missing name (Gether 14. 10. 2026)
    clear.flush({ login_enabled: true, user: { ...user, power: null } });
    await new Promise((resolve) => setTimeout(resolve));
    expect(form.id).toBe('power');
    expect(form.classList).toContain('is-required');
    expect(form.querySelector('.ingame__ask')?.textContent).toContain('Doplň svoju aktuálnu power');
  });
});

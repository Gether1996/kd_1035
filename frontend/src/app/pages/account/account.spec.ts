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

  async function render(me: Me, next?: string) {
    const fixture = TestBed.createComponent(Account);
    if (next) fixture.componentRef.setInput('next', next);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne('/api/auth/me/').flush(me);
    // admin content for SEO (links) is not under test
    TestBed.tick();
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
});

import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Me } from '../../core/auth';
import { Scroll } from '../../core/scroll';
import { Header } from './header';

describe('Header account slot', () => {
  let fixture: ComponentFixture<Header>;
  let http: HttpTestingController;

  const el = () => fixture.nativeElement as HTMLElement;
  const loginLinks = () => el().querySelectorAll<HTMLAnchorElement>('a[href^="/api/auth/discord/login/"]');

  const answer = async (me: Me) => {
    http.expectOne('/api/auth/me/').flush(me);
    await fixture.whenStable();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: Scroll, useValue: { scrolled: signal(false) } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Header);
    fixture.detectChanges(); // whenStable() would wait for the pending /api/auth/me/
  });

  it('links the calendar in the bar and in the mobile menu', () => {
    const links = [...el().querySelectorAll<HTMLAnchorElement>('a[href="/kalendar"]')];
    expect(links.map((a) => a.className.split(' ')[0])).toEqual(['nav__link', 'drawer__link']);
    expect(links[0].textContent?.trim()).toBe('Kalendár');
  });

  it('keeps an empty slot while the API has not answered', () => {
    const slot = el().querySelector('.account');
    expect(slot).not.toBeNull();
    expect(slot?.children.length).toBe(0);
    expect(loginLinks().length).toBe(0);
  });

  it('keeps the empty slot when login is switched off, so the bar does not move', async () => {
    await answer({ login_enabled: false, user: null });
    const slot = el().querySelector('.account');
    expect(slot).not.toBeNull();
    expect(slot?.children.length).toBe(0);
    expect(el().querySelector('.drawer__account')).toBeNull();
    expect(loginLinks().length).toBe(0);
  });

  it('keeps the empty slot when the API fails', async () => {
    http.expectOne('/api/auth/me/').flush('down', { status: 502, statusText: 'Bad Gateway' });
    await fixture.whenStable();
    expect(el().querySelector('.account')?.children.length).toBe(0);
    expect(loginLinks().length).toBe(0);
  });

  it('offers Discord login in the bar and in the drawer', async () => {
    await answer({ login_enabled: true, user: null });
    const links = loginLinks();
    expect(links.length).toBe(2);
    expect(links[0].getAttribute('href')).toBe('/api/auth/discord/login/?next=%2F');
    expect(links[0].textContent).toContain('Prihlásiť');
  });

  it('shows the signed-in player linking to the account page', async () => {
    await answer({
      login_enabled: true,
      user: {
        discord_id: '1',
        name: 'Nelly',
        avatar_url: 'https://cdn.discordapp.com/a.png',
        ingame_name: '',
        is_staff: false,
      },
    });
    expect(loginLinks().length).toBe(0);
    const link = el().querySelector<HTMLAnchorElement>('.account__link');
    expect(link?.getAttribute('href')).toBe('/ucet');
    expect(link?.textContent).toContain('Nelly');
    expect(link?.querySelector('img')?.getAttribute('alt')).toBe('');
    expect(el().querySelector('.drawer__user')?.textContent).toContain('Nelly');
  });
});

import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
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

  it('has the bell to the event reminders next to the player, also before signing in', async () => {
    await answer({ login_enabled: true, user: null });
    const bell = el().querySelector<HTMLAnchorElement>('.account__bell');
    expect(bell?.getAttribute('href')).toBe('/pripomienky');
    expect(bell?.getAttribute('aria-label')).toBe('Pripomienky eventov');
    expect(el().querySelector('.drawer__reminders')?.getAttribute('href')).toBe('/pripomienky');
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
        is_superuser: false,
      },
    });
    expect(loginLinks().length).toBe(0);
    const link = el().querySelector<HTMLAnchorElement>('.account__link:not(.account__bell)');
    expect(link?.getAttribute('href')).toBe('/ucet');
    expect(link?.textContent).toContain('Nelly');
    expect(link?.querySelector('img')?.getAttribute('alt')).toBe('');
    expect(el().querySelector('.drawer__user')?.textContent).toContain('Nelly');
  });
});

describe('Header active item', () => {
  beforeEach(() => {
    // the pages behind the routes use the page header parallax and the scroll reveal
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        unobserve() {}
      },
    );
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter(routes, withComponentInputBinding()),
        { provide: Scroll, useValue: { scrolled: signal(false) } },
      ],
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  async function activeAt(url: string): Promise<string[]> {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    const fixture = TestBed.createComponent(Header);
    fixture.detectChanges();
    // RouterLinkActive sets its class in a microtask; whenStable() would wait for the pending API calls
    await new Promise((resolve) => setTimeout(resolve));
    const el = fixture.nativeElement as HTMLElement;
    return Array.from(el.querySelectorAll('.nav__link.is-active, .drawer__link.is-active'), (a) =>
      [a.className.split(' ')[0], a.getAttribute('href'), a.textContent?.trim(), a.getAttribute('aria-current')].join(
        ' ',
      ),
    );
  }

  // a section link marks the current section (aria-current="true"), never claims to be the exact page
  const guides = ['nav__link /navody Návody true', 'drawer__link /navody Návody true'];
  const cases: [string, string[]][] = [
    ['/navody', guides],
    ['/navody/commanderi', guides],
    ['/navody/commanderi/pary-pre-jazdu', guides],
    ['/cz/navody/eventy', ['nav__link /cz/navody Návody true', 'drawer__link /cz/navody Návody true']],
    ['/o-nas', ['nav__link /o-nas O nás page', 'drawer__link /o-nas O nás page']],
    ['/kalendar', ['nav__link /kalendar Kalendár page', 'drawer__link /kalendar Kalendár page']],
    ['/', []],
  ];
  for (const [url, active] of cases) {
    it(`highlights only the right item on ${url}`, async () => {
      expect(await activeAt(url)).toEqual(active);
    });
  }
});

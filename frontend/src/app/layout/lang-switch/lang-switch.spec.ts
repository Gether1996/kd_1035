import { ApplicationRef } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Auth, Me, Player } from '../../core/auth';
import { LangSwitch } from './lang-switch';

const PLAYER: Player = {
  discord_id: '80351110224678912',
  name: 'Nelly',
  avatar_url: '',
  ingame_name: 'Nelly',
  lang: 'sk',
  approved: true,
  terms_accepted: true,
  is_staff: false,
  is_superuser: false,
};

describe('LangSwitch', () => {
  let fixture: ComponentFixture<LangSwitch>;
  let http: HttpTestingController;

  const link = (lang: string) =>
    (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>(`a[hreflang="${lang}"]`);
  const href = (lang: string) => link(lang)?.getAttribute('href');

  /** the answer of GET /api/auth/me/ – the switch asks for the player and whenStable() waits for the answer */
  const signedIn = async (user: Player | null) => {
    TestBed.tick();
    http.expectOne('/api/auth/me/').flush({ login_enabled: true, user } satisfies Me);
    await TestBed.inject(ApplicationRef).whenStable();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([{ path: '**', children: [] }])],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(LangSwitch);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('keeps the query and the section of a shared link after a navigation', async () => {
    await signedIn(null);
    await TestBed.inject(Router).navigateByUrl('/kalendar?event=5&on=2026-10-14#top');
    await fixture.whenStable();
    expect(href('cs')).toBe('/cz/kalendar?event=5&on=2026-10-14#top');
    expect(href('sk')).toBe('/kalendar?event=5&on=2026-10-14#top');

    await TestBed.inject(Router).navigateByUrl('/cz/navody?commander=attila');
    await fixture.whenStable();
    expect(href('sk')).toBe('/navody?commander=attila');
    expect(href('cs')).toBe('/cz/navody?commander=attila');
  });

  it('links the plain page when there is no query', async () => {
    await signedIn(null);
    await TestBed.inject(Router).navigateByUrl('/o-nas');
    await fixture.whenStable();
    expect(href('cs')).toBe('/cz/o-nas');
  });

  it("a signed-in player's switch saves the profile language too", async () => {
    await signedIn(PLAYER);
    await fixture.whenStable();
    link('cs')!.click();
    const patch = http.expectOne('/api/auth/me/');
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ lang: 'cs' });
    patch.flush({ login_enabled: true, user: { ...PLAYER, lang: 'cs' } } satisfies Me);
    expect(TestBed.inject(Auth).user()?.lang).toBe('cs');

    // the profile already has it – nothing more
    link('cs')!.click();
    http.expectNone('/api/auth/me/');
  });

  it('a failed save keeps the switch and the old profile language', async () => {
    await signedIn(PLAYER);
    await fixture.whenStable();
    link('cs')!.click();
    http.expectOne('/api/auth/me/').flush('down', { status: 500, statusText: 'Server Error' });
    expect(localStorage.getItem('kd1035.lang')).toBe('cs');
    expect(TestBed.inject(Auth).user()?.lang).toBe('sk');
  });

  it('sends nothing for a visitor, the same language or an account without a player language', async () => {
    await signedIn(null);
    await fixture.whenStable();
    link('cs')!.click();
    http.expectNone('/api/auth/me/');

    TestBed.inject(Auth).reload();
    TestBed.tick();
    http.expectOne('/api/auth/me/').flush({ login_enabled: true, user: PLAYER } satisfies Me);
    await TestBed.inject(ApplicationRef).whenStable();
    link('sk')!.click();
    http.expectNone('/api/auth/me/');

    TestBed.inject(Auth).reload();
    TestBed.tick();
    http.expectOne('/api/auth/me/').flush({ login_enabled: true, user: { ...PLAYER, lang: undefined } } satisfies Me);
    await TestBed.inject(ApplicationRef).whenStable();
    link('cs')!.click();
    http.expectNone('/api/auth/me/');
  });
});

import { ApplicationRef } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Auth, Me } from './auth';

const PLAYER: Me = {
  login_enabled: true,
  user: {
    discord_id: '80351110224678912',
    name: 'Nelly',
    avatar_url: 'https://cdn.discordapp.com/x.png',
    ingame_name: '',
    is_staff: false,
  },
};

describe('Auth', () => {
  let auth: Auth;
  let http: HttpTestingController;

  const answer = async (me: Me) => {
    TestBed.tick();
    http.expectOne('/api/auth/me/').flush(me);
    await TestBed.inject(ApplicationRef).whenStable();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([{ path: '**', children: [] }])],
    });
    auth = TestBed.inject(Auth);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('knows nothing until the API answers', async () => {
    expect(auth.ready()).toBe(false);
    expect(auth.enabled()).toBe(false);
    await answer({ login_enabled: false, user: null });
    expect(auth.ready()).toBe(true);
    expect(auth.enabled()).toBe(false);
    expect(auth.user()).toBeNull();
  });

  it('exposes the signed-in player', async () => {
    await answer(PLAYER);
    expect(auth.enabled()).toBe(true);
    expect(auth.user()?.name).toBe('Nelly');
  });

  it('a failed request hides login instead of waiting forever', async () => {
    TestBed.tick();
    http.expectOne('/api/auth/me/').flush('down', { status: 502, statusText: 'Bad Gateway' });
    await TestBed.inject(ApplicationRef).whenStable();
    expect(auth.ready()).toBe(true);
    expect(auth.failed()).toBe(true);
    expect(auth.enabled()).toBe(false);
  });

  it('login URL returns to the current page in the current language', async () => {
    await TestBed.inject(Router).navigateByUrl('/cz/navody/vybava?x=1#top');
    expect(auth.loginUrl()).toBe('/api/auth/discord/login/?next=%2Fcz%2Fnavody%2Fvybava');
    expect(auth.loginUrl('/ucet')).toBe('/api/auth/discord/login/?next=%2Fucet');
  });

  it('logout and delete call the API and reload the player', async () => {
    await answer(PLAYER);

    const logout = auth.logout();
    const post = http.expectOne('/api/auth/logout/');
    expect(post.request.method).toBe('POST');
    post.flush(null, { status: 204, statusText: 'No Content' });
    await logout;
    TestBed.tick();
    http.expectOne('/api/auth/me/').flush({ login_enabled: true, user: null });
    await TestBed.inject(ApplicationRef).whenStable();
    expect(auth.user()).toBeNull();

    const remove = auth.deleteAccount();
    const del = http.expectOne('/api/auth/me/');
    expect(del.request.method).toBe('DELETE');
    del.flush(null, { status: 204, statusText: 'No Content' });
    await remove;
    TestBed.tick();
    http.expectOne('/api/auth/me/').flush({ login_enabled: true, user: null });
  });

  it('saves the in-game name without another request', async () => {
    await answer(PLAYER);
    const save = auth.saveIngameName('GetheR');
    const patch = http.expectOne('/api/auth/me/');
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ ingame_name: 'GetheR' });
    patch.flush({ ...PLAYER, user: { ...PLAYER.user!, ingame_name: 'GetheR' } });
    await save;
    expect(auth.user()?.ingame_name).toBe('GetheR');
  });

  it('a refused action rejects', async () => {
    await answer(PLAYER);
    const remove = auth.deleteAccount();
    http.expectOne('/api/auth/me/').flush({ detail: 'no' }, { status: 403, statusText: 'Forbidden' });
    await expect(remove).rejects.toBeTruthy();
  });
});

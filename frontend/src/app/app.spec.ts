import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { App } from './app';

describe('App preferred-language redirect', () => {
  const start = location.pathname + location.search + location.hash;

  beforeEach(() => {
    // the scroll effects need browser APIs that jsdom does not have
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {} }));
    // admin content and the signed-in player stay pending – not under test
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([{ path: '**', children: [] }])],
    });
  });

  afterEach(() => {
    localStorage.removeItem('kd1035.lang');
    history.replaceState(null, '', start);
    vi.unstubAllGlobals();
  });

  const open = async (url: string) => {
    // the router knows the page, the redirect reads the query and the section from the address bar
    const router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    history.replaceState(null, '', url);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    TestBed.createComponent(App).detectChanges();
    return navigate;
  };

  it('keeps the query of a shared link when switching to the remembered language', async () => {
    localStorage.setItem('kd1035.lang', 'cs');
    expect(await open('/navody?commander=attila')).toHaveBeenCalledWith('/cz/navody?commander=attila', {
      replaceUrl: true,
    });
  });

  it('keeps the query and the section', async () => {
    localStorage.setItem('kd1035.lang', 'sk');
    expect(await open('/cz/kalendar?event=12&on=2026-10-14#top')).toHaveBeenCalledWith(
      '/kalendar?event=12&on=2026-10-14#top',
      { replaceUrl: true },
    );
  });

  it('stays when the page is already in the remembered language', async () => {
    localStorage.setItem('kd1035.lang', 'cs');
    expect(await open('/cz/kalendar?event=12')).not.toHaveBeenCalled();
  });
});

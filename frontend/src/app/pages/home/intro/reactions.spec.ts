import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Auth } from '../../../core/auth';
import { Reactions } from './reactions';

const URL = '/api/reactions/brana-8/';

describe('Reactions under "Múdrosť kráľovstva"', () => {
  let http: HttpTestingController;

  async function render(user: object | null, state: object | 'error', enabled = true) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '**', children: [] }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: Auth,
          useValue: {
            user: signal(user),
            enabled: signal(enabled),
            accountLink: () => ({ path: '/ucet', query: { next: '/' } }),
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(Reactions);
    fixture.componentRef.setInput('target', 'brana-8');
    fixture.detectChanges();
    await fixture.whenStable();
    const req = http.expectOne(URL);
    if (state === 'error') req.flush(null, { status: 500, statusText: 'Error' });
    else req.flush(state);
    await settle(fixture);
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const settle = async (fixture: { detectChanges(): void }) => {
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
  };
  const items = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>('.reaction')];
  const said = (el: HTMLElement) => items(el).map((b) => [b.tagName.toLowerCase(), b.getAttribute('aria-label'), b.textContent?.trim()]);

  afterEach(() => http.verify());

  it('a player adds a like and takes it back; the counts follow', async () => {
    const { fixture, el } = await render({ name: 'Nelly' }, { like: 3, heart: 1, mine: ['heart'] });
    expect(el.querySelector('.reactions')?.getAttribute('aria-label')).toBe('Reakcie hráčov');
    expect(said(el)).toEqual([
      ['button', 'Páči sa mi: 3', '3'],
      ['button', 'Srdiečko: 1', '1'],
    ]);
    const [like, heart] = items(el);
    expect([like.getAttribute('aria-pressed'), heart.getAttribute('aria-pressed')]).toEqual(['false', 'true']);
    expect(heart.classList.contains('is-mine')).toBe(true);

    like.click();
    fixture.detectChanges();
    // at once, before the server answers
    expect(said(el)[0]).toEqual(['button', 'Páči sa mi: 4', '4']);
    const req = http.expectOne(URL);
    expect([req.request.method, req.request.body]).toEqual(['POST', { kind: 'like' }]);
    req.flush({ like: 4, heart: 1, mine: ['heart', 'like'] });
    await settle(fixture);
    expect(items(el)[0].getAttribute('aria-pressed')).toBe('true');

    // failing: back as it was
    items(el)[1].click();
    fixture.detectChanges();
    expect(said(el)[1]).toEqual(['button', 'Srdiečko: 0', '0']);
    http.expectOne(URL).flush(null, { status: 429, statusText: 'Too Many' });
    await settle(fixture);
    expect(said(el)[1]).toEqual(['button', 'Srdiečko: 1', '1']);
    expect(el.querySelector('.reactions__who')).toBeNull();
  });

  it('a visitor sees the counts and is led to sign in', async () => {
    const { el } = await render(null, { like: 2, heart: 0, mine: [] });
    expect(said(el)).toEqual([
      ['a', 'Páči sa mi: 2 – prihlás sa a pridaj reakciu', '2'],
      ['a', 'Srdiečko: 0 – prihlás sa a pridaj reakciu', '0'],
    ]);
    expect(items(el)[0].getAttribute('href')).toBe('/ucet?next=%2F');
  });

  it('without sign-in on the site: the counts only', async () => {
    const { el } = await render(null, { like: 2, heart: 5, mine: [] }, false);
    expect(said(el).map((s) => s[0])).toEqual(['span', 'span']);
  });

  it('the superadmin sees who reacted', async () => {
    const who = { like: ['Boris CzF', 'Nelly'], heart: [] };
    const { el } = await render({ name: 'Gether', is_superuser: true }, { like: 2, heart: 0, mine: [], who });
    const box = el.querySelector('.reactions__who')!;
    expect(box.querySelector('summary')?.textContent?.trim()).toBe('Kto reagoval');
    expect([...box.querySelectorAll('p')].map((p) => p.textContent?.trim())).toEqual(['Boris CzF, Nelly', 'zatiaľ nikto']);
  });

  it('nothing when the API fails – the picture alone', async () => {
    const { el } = await render(null, 'error');
    expect(items(el)).toEqual([]);
    // the empty row keeps its place
    expect(el.querySelector('.reactions')).not.toBeNull();
  });
});

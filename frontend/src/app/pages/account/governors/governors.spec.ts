import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Alliance, KingdomApi } from '../../../core/api';
import { Me } from '../../../core/auth';
import { Governor, governorError } from '../../../core/governors-api';
import { Governors } from './governors';

const URL = '/api/me/governors/';
const ME: Me = {
  login_enabled: true,
  user: { discord_id: '80351110224678912', name: 'Nelly', avatar_url: 'https://cdn.discordapp.com/a.png', is_staff: false },
};
const CS35: Alliance = { id: 1, tag: 'CS35', name: 'CZ/SK Legends', officers: [] };

const governor = (id: number, extra: Partial<Governor> = {}): Governor => ({
  id,
  governor_id: `1000000${id}`,
  name: `Gov ${id}`,
  kind: 'main',
  alliance: null,
  status: 'pending',
  review_note: '',
  created_at: '2026-10-08T10:00:00+02:00',
  ...extra,
});

describe('Governors on the account page', () => {
  let fixture: ComponentFixture<Governors>;
  let http: HttpTestingController;

  const el = () => fixture.nativeElement as HTMLElement;
  const q = <T extends Element>(selector: string) => el().querySelector<T>(selector)!;
  const rows = () => Array.from(el().querySelectorAll('.row'));

  /** signed-in player → their list (whenStable() would wait for the pending list request) */
  const signIn = async () => {
    http.expectOne('/api/auth/me/').flush(ME);
    await Promise.resolve(); // the resource takes the response in a microtask
    TestBed.tick();
    return http.expectOne(URL);
  };

  const load = async (list: Governor[]) => {
    (await signIn()).flush(list);
    await fixture.whenStable();
  };

  const type = (selector: string, value: string) => {
    const input = q<HTMLInputElement>(selector);
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };

  const submit = async () => {
    q<HTMLFormElement>('form').dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
  };

  /** after an answer to POST/DELETE: the component's async handler finishes, then the view updates */
  const settle = async () => {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: KingdomApi, useValue: { alliances: signal([CS35]) } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Governors);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('lists the governors with their status and the R4 note', async () => {
    await load([
      governor(1),
      governor(2, { status: 'rejected', review_note: 'Meno v hre nesedí.' }),
      governor(3, { status: 'approved', kind: 'farm', alliance: { id: 1, tag: 'CS35' } }),
    ]);
    expect(rows().length).toBe(3);
    expect(rows().map((r) => r.querySelector('.badge')?.textContent?.trim())).toEqual([
      'Čaká na schválenie',
      'Zamietnutý',
      'Schválený',
    ]);
    expect(rows()[0].getAttribute('data-status')).toBe('pending');
    expect(rows()[1].querySelector('.row__note')?.textContent).toContain('Meno v hre nesedí.');
    expect(rows()[2].textContent).toContain('[CS35]');
    expect(rows()[2].textContent).toContain('Farma');
    expect(q('.count').textContent?.trim()).toBe('3 / 5');
  });

  it('asks for nothing before the player is known', async () => {
    http.expectOne('/api/auth/me/').flush({ login_enabled: true, user: null });
    await fixture.whenStable();
    http.expectNone(URL);
  });

  it('checks the Governor ID before sending', async () => {
    await load([]);
    expect(q('.empty').textContent).toContain('Zatiaľ tu nemáš');
    type('#governor-id', '12345');
    type('#governor-name', 'Nelly');
    await submit();
    http.expectNone(URL);
    const input = q<HTMLInputElement>('#governor-id');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toContain('governor-id-error');
    expect(q('#governor-id-error').textContent).toContain('Governor ID má 6 až 12 číslic.');
    expect(document.activeElement).toBe(input);
  });

  it('requires the in-game name', async () => {
    await load([]);
    type('#governor-id', '12345678');
    await submit();
    http.expectNone(URL);
    expect(q('#governor-name-error').textContent).toContain('Vyplň toto pole.');
    expect(q('#governor-id').getAttribute('aria-invalid')).toBeNull();
  });

  it('registers a governor and shows it as waiting for approval', async () => {
    await load([governor(1, { status: 'approved' })]);
    type('#governor-id', ' 87654321 ');
    type('#governor-name', ' Nelly Farm ');
    const farm = el().querySelectorAll<HTMLInputElement>('input[name="governor-kind"]')[1];
    farm.click();
    await submit();

    const post = http.expectOne(URL);
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({ governor_id: '87654321', name: 'Nelly Farm', kind: 'farm', alliance: 1 });
    post.flush(governor(9, { governor_id: '87654321', name: 'Nelly Farm', kind: 'farm' }), {
      status: 201,
      statusText: 'Created',
    });
    await settle();

    expect(rows()[0].textContent).toContain('Nelly Farm');
    expect(rows()[0].querySelector('.badge')?.textContent?.trim()).toBe('Čaká na schválenie');
    expect(q('[role="status"]').textContent).toContain('Pridané. Čaká na schválenie R4.');
    expect(q<HTMLInputElement>('#governor-id').value).toBe('');
    expect(q<HTMLInputElement>('#governor-name').value).toBe('');
    expect(el().querySelector('.field__error')).toBeNull();
  });

  it('sends null for another alliance', async () => {
    await load([]);
    type('#governor-id', '87654321');
    type('#governor-name', 'Nelly');
    const select = q<HTMLSelectElement>('#governor-alliance');
    expect(select.value).toBe('1'); // the main alliance is preselected
    select.value = '';
    select.dispatchEvent(new Event('change'));
    await submit();
    const post = http.expectOne(URL);
    expect(post.request.body.alliance).toBeNull();
    post.flush(governor(9));
    await settle();
  });

  it('shows "already registered" next to the ID field', async () => {
    await load([]);
    type('#governor-id', '87654321');
    type('#governor-name', 'Nelly');
    await submit();
    http.expectOne(URL).flush({ code: 'taken' }, { status: 400, statusText: 'Bad Request' });
    await settle();
    expect(q('#governor-id-error').textContent).toContain('Tento Governor ID už je zaregistrovaný – ozvi sa R4.');
    expect(rows().length).toBe(0);
    // typing again clears it
    type('#governor-id', '87654322');
    await fixture.whenStable();
    expect(el().querySelector('#governor-id-error')).toBeNull();
  });

  it('shows a throttled request above the button', async () => {
    await load([]);
    type('#governor-id', '87654321');
    type('#governor-name', 'Nelly');
    await submit();
    http.expectOne(URL).flush({ detail: 'x' }, { status: 429, statusText: 'Too Many Requests' });
    await settle();
    expect(q('[role="alert"]').textContent).toContain('Priveľa pokusov.');
  });

  it('switches the form off at the limit', async () => {
    await load([1, 2, 3, 4, 5].map((id) => governor(id)));
    expect(q<HTMLFieldSetElement>('.form__fields').disabled).toBe(true);
    expect(q('.form__note').textContent).toContain('Viac governorov pridať nemôžeš.');
  });

  it('removes a governor only after confirmation', async () => {
    await load([governor(1), governor(2)]);
    const button = () => rows()[0].querySelector<HTMLButtonElement>('.remove')!;
    button().click();
    await fixture.whenStable();
    http.expectNone(`${URL}1/`);
    expect(button().textContent).toContain('Naozaj odstrániť?');
    expect(button().getAttribute('aria-label')).toBe('Naozaj odstrániť? Gov 1');

    button().click();
    const del = http.expectOne(`${URL}1/`);
    expect(del.request.method).toBe('DELETE');
    del.flush(null, { status: 204, statusText: 'No Content' });
    await settle();
    expect(rows().map((r) => r.querySelector('.row__name')?.textContent)).toEqual(['Gov 2']);
    expect(document.activeElement).toBe(q('#governors-title'));
  });

  it('keeps the page working when the API is down', async () => {
    (await signIn()).flush('down', { status: 502, statusText: 'Bad Gateway' });
    await fixture.whenStable();
    expect(q('.state').textContent).toContain('Governorov sa nepodarilo načítať.');
    expect(el().querySelector('form')).toBeNull();
  });
});

describe('governorError', () => {
  const response = (status: number, error: unknown) => new HttpErrorResponse({ status, error });

  it('maps API answers to the codes the texts use', () => {
    expect(governorError(response(400, { code: 'taken' }))).toBe('taken');
    expect(governorError(response(400, { code: 'limit' }))).toBe('limit');
    expect(governorError(response(400, { code: 'something-new' }))).toBe('failed');
    expect(governorError(response(429, { detail: 'slow down' }))).toBe('throttled');
    expect(governorError(response(403, { detail: 'no' }))).toBe('failed');
    expect(governorError(new Error('offline'))).toBe('failed');
  });
});

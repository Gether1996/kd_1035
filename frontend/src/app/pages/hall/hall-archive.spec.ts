import { PLATFORM_ID, Type, signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it } from 'vitest';
import { Auth } from '../../core/auth';
import { HallAdmin } from './hall-admin';
import { HallArchive, HallEntry } from './hall-data';
import { HallPage } from './hall-page';

// the requests resolve in promises – let them finish, then render
const tick = async (fixture: { detectChanges(): void }) => {
  await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
};

const PLACES = { forts: 3, kp: 5, rally: 1, garrison: 1, helper: 1, diplomat: 1, equipment: 3, mascot: 2, zero: 3 };
const entry = (category: HallEntry['category'], place: number, name: string, count = ''): HallEntry => ({
  id: place * 10 + category.length,
  category,
  place,
  name,
  avatar_url: '',
  photo: '',
  note: { sk: '', cs: '' },
  count,
});
const KVK3: HallArchive = {
  id: 7,
  label: 'KvK 3',
  created_at: '2026-11-03T18:00:00Z',
  entries: [
    { category: 'kp', place: 2, name: 'Fox', count: '842998273', note: { sk: '', cs: '' } },
    { category: 'kp', place: 1, name: 'Nelly', count: '2273581583', note: { sk: '', cs: '' } },
    { category: 'forts', place: 1, name: 'Bobo', count: '48', note: { sk: 'Najviac', cs: 'Nejvíc' } },
    { category: 'equipment', place: 2, name: 'Maroš', count: '', note: { sk: 'jazda', cs: 'jízda' } },
  ],
};

function setup(component: Type<unknown>) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: PLATFORM_ID, useValue: 'browser' },
      {
        provide: Auth,
        useValue: { ready: signal(true), user: signal({ name: 'Nelly', approved: true, is_superuser: false }) },
      },
    ],
  });
  const fixture = TestBed.createComponent(component);
  fixture.detectChanges();
  return { fixture, http: TestBed.inject(HttpTestingController), el: fixture.nativeElement as HTMLElement };
}

describe('Sieň legiend', () => {
  afterEach(() => {
    const http = TestBed.inject(HttpTestingController);
    // what the page's services load besides the hall (links, alliances…) is not this spec's
    http.match((request) => !request.url.startsWith('/api/hall/'));
    http.verify();
  });

  it('is collapsed under the hall, the names in place order with their numbers', async () => {
    const { fixture, http, el } = setup(HallPage);
    http.expectOne('/api/hall/').flush({ entries: [entry('rally', 1, 'Nelly')], archive: [KVK3] });
    await tick(fixture);
    const details = el.querySelector<HTMLDetailsElement>('details.legends')!;
    expect(details.open).toBe(false);
    expect(details.querySelector('summary')?.textContent).toContain('Sieň legiend');
    expect(el.querySelector('.board__title')?.textContent).toBe('KvK 3');
    const cats = Array.from(el.querySelectorAll('.board__cat')).map((cat) =>
      Array.from(cat.querySelectorAll('li')).map((li) =>
        Array.from(li.querySelectorAll('span'))
          .map((span) => span.textContent?.trim())
          .join(' '),
      ),
    );
    // the order of the hall; the KP short like the banners, the equipment's troop type instead of a number
    expect(cats).toEqual([['1. Bobo 48 pevností Najviac'], ['1. Nelly 2.3B', '2. Fox 843M'], ['Maroš jazda']]);
  });

  it('has no block without an archive', async () => {
    const { fixture, http, el } = setup(HallPage);
    http.expectOne('/api/hall/').flush({ entries: [entry('rally', 1, 'Nelly')], archive: [] });
    await tick(fixture);
    expect(el.querySelector('details.legends')).toBeNull();
  });

  it('the editor archives every filled category but the mascots by default', async () => {
    const { fixture, http, el } = setup(HallAdmin);
    http.expectOne('/api/hall/').flush({
      entries: [entry('kp', 1, 'Nelly', '1.37B'), entry('mascot', 1, 'Bobo'), entry('zero', 1, 'Fox')],
      archive: [],
      places: PLACES,
    });
    http.expectOne('/api/kvk/reviewers/').flush({ players: [] });
    await tick(fixture);
    const chips = Array.from(el.querySelectorAll<HTMLInputElement>('.archive .chip input'));
    expect(chips.map((c) => [c.parentElement?.textContent?.trim(), c.checked])).toEqual([
      ['Top KP', true],
      ['Zero', true],
      ['Maskoti KD', false],
    ]);
    const label = el.querySelector<HTMLInputElement>('#hall-archive-label')!;
    label.value = ' KvK 3 ';
    label.dispatchEvent(new Event('input'));
    el.querySelector<HTMLFormElement>('.archive form')!.dispatchEvent(new Event('submit'));
    const post = http.expectOne('/api/hall/archive/');
    expect(post.request.body).toEqual({ label: 'KvK 3', categories: ['kp', 'zero'] });
    post.flush({ archive: [KVK3] });
    await tick(fixture);
    expect(el.querySelector('.archive__label')?.textContent).toBe('KvK 3');
    expect(el.textContent).toContain('Uložené do archívu.');
  });
});

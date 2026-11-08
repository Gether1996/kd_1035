import { PLATFORM_ID, Type, signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it } from 'vitest';
import { Auth } from '../../core/auth';
import { HallAdmin, addDays, lastWeek } from './hall-admin';
import { HallEntry, weekRange } from './hall-data';
import { HallPage } from './hall-page';

const tick = async (fixture: { detectChanges(): void }) => {
  await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
};

const PLACES = { forts: 5, kp: 5, rally: 1, garrison: 1, helper: 1, diplomat: 1, equipment: 3, mascot: 2, zero: 3 };
const entry = (category: HallEntry['category'], place: number, name: string, count = ''): HallEntry => ({
  id: place * 10 + category.length,
  category,
  place,
  name,
  avatar_url: '',
  photo: '',
  note: { sk: 'starý dôvod', cs: '' },
  count,
  player: null,
  custom_name: name,
});

function setup(component: Type<unknown>, superuser = true) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: PLATFORM_ID, useValue: 'browser' },
      {
        provide: Auth,
        useValue: { ready: signal(true), user: signal({ name: 'Gether', approved: true, is_superuser: superuser }) },
      },
    ],
  });
  const fixture = TestBed.createComponent(component);
  fixture.detectChanges();
  return { fixture, http: TestBed.inject(HttpTestingController), el: fixture.nativeElement as HTMLElement };
}

describe('Ničiteľ pevností – the week (Gether 7. 11. 2026)', () => {
  afterEach(() => {
    const http = TestBed.inject(HttpTestingController);
    http.match((request) => !request.url.startsWith('/api/hall/'));
    http.verify();
  });

  async function editor(week: object) {
    const { fixture, http, el } = setup(HallAdmin);
    http.expectOne('/api/hall/').flush({
      entries: [entry('forts', 1, 'Nelly', '200'), entry('rally', 1, 'Maroš')],
      archive: [],
      places: PLACES,
      forts_week: week,
    });
    http.expectOne('/api/kvk/reviewers/').flush({ players: [] });
    await tick(fixture);
    const buttons = () => Array.from(el.querySelectorAll<HTMLButtonElement>('.week button'));
    const button = (text: string) => buttons().find((b) => b.textContent?.trim() === text)!;
    return { fixture, http, el, button };
  }

  it('five places, no reasons, the days of the week to save', async () => {
    const { fixture, http, el, button } = await editor({ from: null, to: null, published_at: null, webhook: true });
    expect(el.querySelectorAll('[aria-labelledby="hall-edit-forts"] form.slot').length).toBe(5);
    // the reasons are gone from every category
    expect(el.textContent).not.toContain('Dôvod');
    // the last full week offered, Monday to Sunday; the arrows move it a whole week
    const range = () => el.querySelector('.week__range')?.textContent?.trim();
    const offered = lastWeek();
    expect(new Date(offered.from + 'T12:00').getDay()).toBe(1);
    expect(addDays(offered.from, 6)).toBe(offered.to);
    expect(el.querySelector('.week__status')?.textContent?.trim()).toBe('Zatiaľ nezverejnené.');
    const arrow = (label: string) => el.querySelector<HTMLButtonElement>(`.week__picker button[aria-label="${label}"]`)!;
    arrow('Ďalší týždeň').click();
    fixture.detectChanges();
    expect(range()).toBe(weekRange(addDays(offered.from, 7), addDays(offered.to, 7)));
    arrow('Predchádzajúci týždeň').click();
    arrow('Predchádzajúci týždeň').click();
    fixture.detectChanges();
    expect(range()).toBe(weekRange(addDays(offered.from, -7), addDays(offered.to, -7)));
    button('Uložiť týždeň').click();
    const put = http.expectOne('/api/hall/forts/week/');
    expect(put.request.body).toEqual({ week_from: addDays(offered.from, -7), week_to: addDays(offered.to, -7) });
    put.flush({ from: '2026-10-26', to: '2026-11-01', published_at: null, webhook: true });
    await tick(fixture);
    expect(el.querySelector('.week__status')?.textContent?.trim()).toBe('26. 10. – 1. 11. 2026 · Zatiaľ nezverejnené.');
    // a save of a place empties its old reason
    el.querySelector<HTMLFormElement>('[aria-labelledby="hall-edit-forts"] form.slot')!.dispatchEvent(new Event('submit'));
    const save = http.expectOne('/api/hall/forts/1/');
    expect(save.request.body).toEqual({ player: null, name: 'Nelly', note_sk: '', note_cs: '', count: '200' });
    save.flush(entry('forts', 1, 'Nelly', '200'));
  });

  it('posts once after asking, then the forts are locked', async () => {
    const { fixture, http, el, button } = await editor({ from: '2026-10-26', to: '2026-11-01', published_at: null, webhook: true });
    button('Zverejniť posledný týždeň na Discord').click();
    fixture.detectChanges();
    expect(el.querySelector('.week .slot__confirm')?.textContent).toContain('Naozaj zverejniť poradie v kanáli sieň-slávy s @everyone?');
    button('Zverejniť').click();
    http.expectOne('/api/hall/forts/publish/').flush({ from: '2026-10-26', to: '2026-11-01', published_at: '2026-11-07T17:30:00Z', webhook: true });
    await tick(fixture);
    expect(el.querySelector('.week__status')?.textContent).toContain('Zverejnené na Discorde');
    expect(button('Zverejniť posledný týždeň na Discord').disabled).toBe(true);
    const forts = el.querySelector('[aria-labelledby="hall-edit-forts"]')!;
    expect(Array.from(forts.querySelectorAll<HTMLFieldSetElement>('fieldset')).every((f) => f.disabled)).toBe(true);
    // the other categories stay open
    const rally = el.querySelector('[aria-labelledby="hall-edit-rally"] fieldset') as HTMLFieldSetElement;
    expect(rally.disabled).toBe(false);
  });

  it('archives after a warning: the category is emptied and the next week offered', async () => {
    const week = { from: '2026-10-26', to: '2026-11-01', published_at: '2026-11-07T17:30:00Z', webhook: true };
    const { fixture, http, el, button } = await editor(week);
    button('Uložiť do archívu').click();
    fixture.detectChanges();
    expect(el.querySelector('.week .slot__confirm')?.textContent).toContain('Pozor, ľudia z kategórie sa vymažú.');
    button('Uložiť a vymazať').click();
    http.expectOne('/api/hall/forts/archive/').flush({
      archive: [{ id: 3, label: 'Týždeň 26. 10. – 1. 11. 2026', week_from: '2026-10-26', week_to: '2026-11-01', created_at: '2026-11-07T18:00:00Z', entries: [] }],
      forts_week: { from: '2026-11-02', to: '2026-11-08', published_at: null, webhook: true },
    });
    await tick(fixture);
    expect(el.querySelector('.archive__label')?.textContent).toBe('Týždeň 26. 10. – 1. 11. 2026');
    expect(el.querySelectorAll('[aria-labelledby="hall-edit-forts"] form.slot.is-filled').length).toBe(0);
    expect(el.querySelector('.week__range')?.textContent?.trim()).toBe('2. 11. – 8. 11. 2026');
    expect(button('Zverejniť posledný týždeň na Discord').disabled).toBe(false);
  });

  it('says why the post failed', async () => {
    const { fixture, http, el, button } = await editor({ from: '2026-10-26', to: '2026-11-01', published_at: null, webhook: false });
    const answers: [object, number, string][] = [
      [{ detail: 'no_webhook' }, 503, 'Na serveri chýba DISCORD_HALL_WEBHOOK_URL.'],
      [{ detail: 'discord', uncertain: true }, 502, 'Discord neodpovedal – pozri do kanála, správa mohla prísť.'],
      [{ detail: 'empty' }, 400, 'V poradí nie je nikto.'],
    ];
    for (const [body, status, said] of answers) {
      button('Zverejniť posledný týždeň na Discord').click();
      fixture.detectChanges();
      button('Zverejniť').click();
      http.expectOne('/api/hall/forts/publish/').flush(body, { status, statusText: String(status) });
      await tick(fixture);
      expect(el.querySelector('.week .slot__state')?.textContent?.trim()).toBe(said);
    }
  });

  it('the hall shows the week under the fort destroyers, no reasons', async () => {
    const { fixture, http, el } = setup(HallPage, false);
    http.expectOne('/api/hall/').flush({
      entries: [entry('forts', 1, 'Nelly', '200'), entry('forts', 5, 'Piaty', '1')],
      archive: [],
      forts_week: { from: '2026-10-26', to: '2026-11-01' },
    });
    await tick(fixture);
    expect(el.querySelector('[data-cat="forts"] .pillar__period')?.textContent?.trim()).toBe('26. 10. – 1. 11. 2026');
    expect(Array.from(el.querySelectorAll('[data-cat="forts"] .pillar__ranks li')).map((li) => Array.from(li.querySelectorAll('span')).map((span) => span.textContent?.trim()).join(' '))).toEqual([
      '1. Nelly 200',
      '5. Piaty 1',
    ]);
    expect(el.textContent).not.toContain('starý dôvod');
  });

});

describe('weekRange', () => {
  it('formats a week across New Year with both years', () => {
    expect(weekRange('2026-12-29', '2027-01-04')).toBe('29. 12. 2026 – 4. 1. 2027');
    expect(weekRange(null, '2027-01-04')).toBe('');
  });
});

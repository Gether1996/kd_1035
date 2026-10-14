import { PLATFORM_ID, signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, provideRouter } from '@angular/router';
import { ARMORY } from '../../core/armory-testing';
import { Auth } from '../../core/auth';
import { Scroll } from '../../core/scroll';
import { EvaluationPage } from './evaluation-page';
import { leaveEvaluation } from './leave-guard';
import { afterEach, describe, expect, it, vi } from 'vitest';

const SUPERUSER = { name: 'Gether', approved: true, is_superuser: true };

// Seo and the page header keep tasks pending – render by hand instead of whenStable()
const tick = async (fixture: { detectChanges(): void }) => {
  await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
};

function setup(user: object, platform = 'browser') {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: PLATFORM_ID, useValue: platform },
      { provide: Scroll, useValue: { scrolled: signal(false), reducedMotion: true, onFrame: () => () => {} } },
      {
        provide: Auth,
        useValue: {
          ready: signal(true),
          failed: signal(false),
          enabled: signal(true),
          user: signal(user),
          loginUrl: () => '/api/auth/discord/login/',
          reload: () => {},
        },
      },
    ],
  });
  return TestBed.inject(HttpTestingController);
}

/** the page with its data loaded – a saved benchmark that is not the default, so "Predvolené" makes it dirty */
async function open(user: object, tab?: string, players: object[] = [], data: object = {}): Promise<ComponentFixture<EvaluationPage>> {
  const http = setup(user);
  const fixture = TestBed.createComponent(EvaluationPage);
  if (tab) fixture.componentRef.setInput('tab', tab);
  fixture.detectChanges();
  http.expectOne('/api/evaluation/').flush({
    settings: { acclaim: { benchmark: 1_000_000 } },
    updated_at: null,
    pairs: [],
    pairs_version: '1',
    formations: {},
    formations_version: '1',
    players,
    overview: { published_at: null, rows: [] },
    ...data,
  });
  http.match('/api/commanders/marches/').forEach((r) => r.flush([]));
  http.match('/api/armory/').forEach((r) => r.flush(ARMORY));
  await tick(fixture);
  await tick(fixture);
  return fixture;
}

const shown = (fixture: ComponentFixture<EvaluationPage>) => {
  const el = fixture.nativeElement as HTMLElement;
  if (el.querySelector('app-eval-overview')) return 'overview';
  return el.querySelector('app-eval-settings') ? 'settings' : el.querySelector('app-eval-results') ? 'results' : null;
};

const button = (fixture: ComponentFixture<EvaluationPage>, text: string) =>
  Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button')).find(
    (b) => b.textContent?.trim() === text,
  )!;

const guard = (page: EvaluationPage | null) =>
  TestBed.runInInjectionContext(() =>
    leaveEvaluation(page as EvaluationPage, {} as ActivatedRouteSnapshot, {} as RouterStateSnapshot, {} as RouterStateSnapshot),
  );

const unload = () => {
  const event = new Event('beforeunload', { cancelable: true });
  dispatchEvent(event);
  return event.defaultPrevented;
};

describe('EvaluationPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('opens the tab named in the address and keeps the picked one there', async () => {
    const fixture = await open(SUPERUSER);
    expect(shown(fixture)).toBe('results');

    const router = TestBed.inject(Router);
    button(fixture, 'Premenné').click();
    await tick(fixture);
    expect(router.url).toBe('/?tab=premenne');
    button(fixture, 'Odhad acclaimu').click();
    await tick(fixture);
    expect(router.url).toBe('/');

    fixture.componentRef.setInput('tab', 'premenne');
    await tick(fixture);
    expect(shown(fixture)).toBe('settings');
    // an unknown value shows the table
    fixture.componentRef.setInput('tab', 'xyz');
    await tick(fixture);
    expect(shown(fixture)).toBe('results');

    // the published overview, as the players see it (Gether 14. 10. 2026)
    button(fixture, 'Požadovaný acclaim').click();
    await tick(fixture);
    expect(router.url).toBe('/?tab=prehlad');
    fixture.componentRef.setInput('tab', 'prehlad');
    await tick(fixture);
    TestBed.inject(HttpTestingController).expectOne('/api/evaluation/overview/').flush({ published_at: null, rows: [] });
    await tick(fixture);
    expect(shown(fixture)).toBe('overview');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Požadovaný acclaim zatiaľ nie je zverejnený.');
  });

  it('shows a player with the overview switch only the published required acclaim', async () => {
    const http = setup({ name: 'Slim', approved: true, evaluation_overview: true });
    const fixture = TestBed.createComponent(EvaluationPage);
    fixture.componentRef.setInput('tab', 'premenne');
    fixture.detectChanges();
    // nothing of the evaluation itself is asked for
    http.expectNone('/api/evaluation/');
    const row = { avatar_url: '', missing: 0, you: false, power: null, recommended: null };
    http.expectOne('/api/evaluation/overview/').flush({
      published_at: '2026-10-14T16:30:00Z',
      rows: [
        { ...row, id: 1, name: 'Gether', marches: 5, required: 3_000_000, power: 95, recommended: 101.5 },
        { ...row, id: 2, name: 'Slim', marches: 3, missing: 2, required: 5_600_000, you: true, power: 104.2, recommended: 80 },
        { ...row, id: 3, name: 'Enko', marches: 1, required: 200_000 },
      ],
    });
    await tick(fixture);
    await tick(fixture);
    const el = fixture.nativeElement as HTMLElement;
    expect(shown(fixture)).toBe('overview');
    expect(button(fixture, 'Premenné')).toBeUndefined();
    expect(el.querySelector('input:not([type=search]), select, textarea')).toBeNull();
    // the highest first, the reader's own on top too
    const names = () => Array.from(el.querySelectorAll('.ov-name')).map((n) => n.textContent?.trim());
    expect(names()).toEqual(['Slim', 'Gether', 'Enko']);
    expect(el.querySelector('.ov-mine__value')?.textContent?.replace(/\s/g, '')).toBe('5600000');
    expect(el.querySelector('tr.is-you .ov-you')?.textContent?.trim()).toBe('ty');
    // the power with the recommended power under it, red when the marches carry less (Gether 14. 10. 2026)
    const power = el.querySelector('tr.is-you .ov-power')!;
    expect(power.querySelector('.is-over')?.textContent?.trim()).toBe('104,2');
    expect(power.querySelector('.ov-power__rec')?.textContent?.trim()).toBe('odp. 80');
    expect(el.querySelector('tr:not(.is-you) .ov-power .is-over')).toBeNull();

    // a click on a header sorts by it, again the other way; no power is always last; the rank stays
    const header = (text: string) =>
      Array.from(el.querySelectorAll<HTMLButtonElement>('.ov-sort')).find((b) => b.textContent?.trim().startsWith(text))!;
    header('Power (M)').click();
    await tick(fixture);
    expect(names()).toEqual(['Slim', 'Gether', 'Enko']);
    expect(header('Power (M)').closest('th')?.getAttribute('aria-sort')).toBe('descending');
    header('Power (M)').click();
    await tick(fixture);
    expect(names()).toEqual(['Gether', 'Slim', 'Enko']);
    header('Hráč').click();
    await tick(fixture);
    expect(names()).toEqual(['Enko', 'Gether', 'Slim']);
    expect(Array.from(el.querySelectorAll('td.ov-rank')).map((n) => n.textContent?.trim())).toEqual(['3', '2', '1']);
  });

  it('publishes what the table counts – not while the variables are unsaved', async () => {
    const player = { id: 7, name: 'nelly', ingame_name: 'Nelly', avatar_url: '', approved: true, marches: [], power: 100, t4: false, power_bonus: 0 };
    const waiting = { ...player, id: 8, approved: false };
    const fixture = await open(SUPERUSER, undefined, [player, waiting]);
    const http = TestBed.inject(HttpTestingController);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.ev-publish__state')?.textContent?.trim()).toBe('Požadovaný acclaim hráči zatiaľ nevidia.');

    button(fixture, 'Zverejniť').click();
    const put = http.expectOne('/api/evaluation/overview/');
    expect(put.request.method).toBe('PUT');
    // the approved player only; no marches, but the power asks for five
    const rows = put.request.body.rows;
    expect(rows.map((r: { id: number; marches: number; missing: number }) => [r.id, r.marches, r.missing])).toEqual([[7, 0, 5]]);
    put.flush({ published_at: '2026-10-14T16:30:00Z', rows });
    await tick(fixture);
    expect(el.querySelector('.ev-publish__state')?.textContent).toContain('Hráči vidia to isté ako táto tabuľka.');

    // the variables changed and not saved: the button waits
    fixture.componentRef.setInput('tab', 'premenne');
    await tick(fixture);
    button(fixture, 'Predvolené').click();
    fixture.componentRef.setInput('tab', undefined);
    await tick(fixture);
    await tick(fixture);
    expect(button(fixture, 'Zverejniť').disabled).toBe(true);
    expect(el.querySelector('.ev-publish__state')?.textContent?.trim()).toBe('Pred zverejnením ulož premenné.');
  });

  it('asks before leaving unsaved variables, and the browser asks when the tab closes', async () => {
    const fixture = await open(SUPERUSER, 'premenne');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(guard(fixture.componentInstance)).toBe(true);
    expect(unload()).toBe(false);
    expect(confirm).not.toHaveBeenCalled();

    button(fixture, 'Predvolené').click();
    await tick(fixture);
    await tick(fixture);
    // Cancel keeps the page and the draft
    expect(guard(fixture.componentInstance)).toBe(false);
    expect(confirm).toHaveBeenCalledWith('Premenné majú neuložené zmeny. Odísť bez uloženia?');
    expect(button(fixture, 'Zahodiť zmeny').disabled).toBe(false);
    // closing, reloading – and the full page load of a newer build (SiteUpdate.go) – get the browser's own question
    expect(unload()).toBe(true);
    confirm.mockReturnValue(true);
    expect(guard(fixture.componentInstance)).toBe(true);

    button(fixture, 'Zahodiť zmeny').click();
    await tick(fixture);
    await tick(fixture);
    confirm.mockClear();
    expect(guard(fixture.componentInstance)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    expect(unload()).toBe(false);

    // the listener goes with the page
    button(fixture, 'Predvolené').click();
    await tick(fixture);
    await tick(fixture);
    expect(unload()).toBe(true);
    fixture.destroy();
    expect(unload()).toBe(false);
  });

  it('narrows the table by a quick filter kept in ?f=, with counts that follow the search and Hráči', async () => {
    const march = { id: 1, position: 1, kind: 'archer', primary: 'Qin Shi Huang', secondary: 'Yi Seong-Gye' };
    const solo = { ...march, id: 2, position: 2, secondary: '' };
    const p = { ingame_name: '', avatar_url: '', approved: true, t4: false, power_bonus: 0 };
    const players = [
      // more power than one march carries
      { ...p, id: 1, name: 'Anna', marches: [march], power: 100 },
      // a solo march, no power
      { ...p, id: 2, name: 'Boris', marches: [march, solo], power: null },
      // no marches – not among "S marchmi"
      { ...p, id: 3, name: 'Cyril', marches: [], power: null },
      { ...p, id: 4, name: 'Dana', marches: [march], power: 50 },
    ];
    const fixture = await open(SUPERUSER, undefined, players, { pairs: [['Qin Shi Huang', 'Yi Seong-Gye', 117]] });
    const el = fixture.nativeElement as HTMLElement;
    const router = TestBed.inject(Router);
    const quick = () => Array.from(el.querySelectorAll<HTMLButtonElement>('.ev-quick button'));
    const labels = () => quick().map((b) => b.textContent?.trim());
    const pressed = () => quick().find((b) => b.getAttribute('aria-pressed') === 'true')?.textContent?.trim();
    const names = () => Array.from(el.querySelectorAll('.ev-player__name')).map((n) => n.textContent?.trim());
    const change = async (id: string, value: string) => {
      const box = el.querySelector<HTMLInputElement | HTMLSelectElement>(id)!;
      box.value = value;
      box.dispatchEvent(new Event(id === '#ev-search' ? 'input' : 'change'));
      await tick(fixture);
    };

    expect(el.querySelector('.ev-quick')?.getAttribute('aria-label')).toBe('Rýchly filter');
    expect(labels()).toEqual(['Všetci · 3', 'Na opravu · 1', 'Bez power · 1', 'Nad odp. power · 1']);
    // the counts follow the search and "Hráči"
    await change('#ev-search', 'da');
    expect(labels()).toEqual(['Všetci · 1', 'Na opravu · 0', 'Bez power · 0', 'Nad odp. power · 0']);
    await change('#ev-search', '');
    await change('#ev-show', 'approved');
    expect(labels()).toEqual(['Všetci · 4', 'Na opravu · 1', 'Bez power · 2', 'Nad odp. power · 1']);

    // by power: the most first, without power last
    await change('#ev-sort', 'power');
    expect(names()).toEqual(['Anna', 'Dana', 'Boris', 'Cyril']);

    quick()[2].click();
    await tick(fixture);
    expect(names()).toEqual(['Boris', 'Cyril']);
    expect(router.url).toBe('/?f=nopower');
    // the tabs keep ?f=
    button(fixture, 'Premenné').click();
    await tick(fixture);
    expect(router.url).toBe('/?f=nopower&tab=premenne');
    button(fixture, 'Odhad acclaimu').click();
    await tick(fixture);
    expect(router.url).toBe('/?f=nopower');
    quick()[0].click();
    await tick(fixture);
    expect(router.url).toBe('/');

    // a link with ?f=fix opens the same view
    fixture.componentRef.setInput('f', 'fix');
    await tick(fixture);
    expect(pressed()).toBe('Na opravu · 1');
    expect(names()).toEqual(['Boris']);

    // "Rátať s power" off: no power filters, an active one back to all and out of the address
    await router.navigateByUrl('/?f=over');
    fixture.componentRef.setInput('f', 'over');
    await tick(fixture);
    expect(pressed()).toBe('Nad odp. power · 1');
    expect(names()).toEqual(['Anna']);
    el.querySelector<HTMLInputElement>('.ev-switch input')!.click();
    await tick(fixture);
    await tick(fixture);
    expect(labels()).toEqual(['Všetci · 4', 'Na opravu · 1']);
    expect(pressed()).toBe('Všetci · 4');
    expect(router.url).toBe('/');
    // and a link with a power filter is not taken while it is off
    fixture.componentRef.setInput('f', undefined);
    await router.navigateByUrl('/?f=nopower');
    fixture.componentRef.setInput('f', 'nopower');
    await tick(fixture);
    await tick(fixture);
    expect(pressed()).toBe('Všetci · 4');
    expect(router.url).toBe('/');
  });

  it('never asks on the server', () => {
    setup(SUPERUSER, 'server');
    const confirm = vi.spyOn(window, 'confirm');
    const dirty = { canLeave: () => false } as unknown as EvaluationPage;
    expect(guard(dirty)).toBe(true);
    expect(guard(null)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });
});

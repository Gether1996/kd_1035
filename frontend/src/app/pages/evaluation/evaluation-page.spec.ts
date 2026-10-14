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
async function open(user: object, tab?: string, players: object[] = []): Promise<ComponentFixture<EvaluationPage>> {
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
    const row = { avatar_url: '', missing: 0, you: false };
    http.expectOne('/api/evaluation/overview/').flush({
      published_at: '2026-10-14T16:30:00Z',
      rows: [
        { ...row, id: 1, name: 'Gether', marches: 5, required: 3_000_000 },
        { ...row, id: 2, name: 'Slim', marches: 3, missing: 2, required: 5_600_000, you: true },
      ],
    });
    await tick(fixture);
    await tick(fixture);
    const el = fixture.nativeElement as HTMLElement;
    expect(shown(fixture)).toBe('overview');
    expect(button(fixture, 'Premenné')).toBeUndefined();
    expect(el.querySelector('input:not([type=search]), select, textarea')).toBeNull();
    // the highest first, the reader's own on top too
    expect(Array.from(el.querySelectorAll('.ov-name')).map((n) => n.textContent?.trim())).toEqual(['Slim', 'Gether']);
    expect(el.querySelector('.ov-mine__value')?.textContent?.replace(/\s/g, '')).toBe('5600000');
    expect(el.querySelector('tr.is-you .ov-you')?.textContent?.trim()).toBe('ty');
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

  it('never asks on the server', () => {
    setup(SUPERUSER, 'server');
    const confirm = vi.spyOn(window, 'confirm');
    const dirty = { canLeave: () => false } as unknown as EvaluationPage;
    expect(guard(dirty)).toBe(true);
    expect(guard(null)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });
});

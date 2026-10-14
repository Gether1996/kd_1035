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
async function open(user: object, tab?: string): Promise<ComponentFixture<EvaluationPage>> {
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
    players: [],
  });
  http.match('/api/commanders/marches/').forEach((r) => r.flush([]));
  http.match('/api/armory/').forEach((r) => r.flush(ARMORY));
  await tick(fixture);
  await tick(fixture);
  return fixture;
}

const shown = (fixture: ComponentFixture<EvaluationPage>) => {
  const el = fixture.nativeElement as HTMLElement;
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
  });

  it('shows only the tab of the switch the player has, whatever the address says', async () => {
    const table = await open({ name: 'Slim', approved: true, evaluator: true }, 'premenne');
    expect(shown(table)).toBe('results');
    expect(button(table, 'Premenné')).toBeUndefined();
    TestBed.resetTestingModule();

    const settings = await open({ name: 'Slim', approved: true, evaluation_settings: true });
    expect(shown(settings)).toBe('settings');
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

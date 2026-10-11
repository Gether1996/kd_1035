import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SiteUpdate } from './site-update';

function setup(running: string | null, deployed: string) {
  document.querySelectorAll('script[data-test]').forEach((s) => s.remove());
  if (running) {
    const script = document.createElement('script');
    script.dataset['test'] = '';
    script.setAttribute('src', running);
    script.type = 'text/plain';
    document.head.append(script);
  }
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response(`<script src="${deployed}" type="module"></script>`));
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  return { update: TestBed.inject(SiteUpdate), fetch };
}

describe('SiteUpdate', () => {
  afterEach(() => vi.restoreAllMocks());

  it('notices a newer deployed build', async () => {
    const { update, fetch } = setup('main-OLD123.js', 'main-NEW456.js');
    await update.check(true);
    expect(fetch).toHaveBeenCalledWith('/index.csr.html', { cache: 'no-store' });
    expect(update.available()).toBe(true);
  });

  it('stays quiet on the same build and within a minute', async () => {
    const { update, fetch } = setup('main-SAME1.js', 'main-SAME1.js');
    await update.check(true);
    expect(update.available()).toBe(false);
    await update.check();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does nothing without a hashed bundle (ng serve)', async () => {
    const { update, fetch } = setup(null, 'main-NEW456.js');
    await update.check(true);
    expect(fetch).not.toHaveBeenCalled();
    expect(update.available()).toBe(false);
  });

  it('after a deploy another page loads fresh, a query change on the same page does not', async () => {
    const { update } = setup('main-OLD123.js', 'main-NEW456.js');
    const router = TestBed.inject(Router);
    router.resetConfig([{ path: '**', children: [] }]);
    await router.navigateByUrl('/navody');
    await update.check(true);
    const go = vi.spyOn(update as unknown as { go(url: string): void }, 'go').mockImplementation(() => {});
    await router.navigateByUrl('/navody?q=sun');
    expect(go).not.toHaveBeenCalled();
    await router.navigateByUrl('/kalendar');
    expect(go).toHaveBeenCalledWith('/kalendar');
  });
});


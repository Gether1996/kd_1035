import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { reloadOnReturn } from './reload-on-return';

describe('reloadOnReturn', () => {
  it('asks again when the visitor comes back to the tab, not more often than every 15 s', () => {
    let now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const reload = vi.fn();
    TestBed.runInInjectionContext(() => reloadOnReturn(reload));
    const doc = TestBed.inject(DOCUMENT);

    doc.dispatchEvent(new Event('visibilitychange'));
    expect(reload).not.toHaveBeenCalled(); // just opened

    now += 20_000;
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(reload).toHaveBeenCalledTimes(1);
    doc.defaultView!.dispatchEvent(new Event('focus'));
    expect(reload).toHaveBeenCalledTimes(1); // focus right after the tab switch

    now += 20_000;
    doc.defaultView!.dispatchEvent(new Event('focus'));
    expect(reload).toHaveBeenCalledTimes(2);
    vi.restoreAllMocks();
  });
});

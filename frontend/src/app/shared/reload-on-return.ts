import { DOCUMENT, DestroyRef, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/** a return within this time does not ask again */
const QUIET_MS = 15_000;

/**
 * Lists other players change (marches, KvK sign-ups): ask the server again when the visitor comes back to the tab or
 * the window (Gether 11. 10. 2026: a player filled in the bonuses and the open list did not show them). Call it in an
 * injection context; `reload` is e.g. an httpResource's reload, which keeps the shown value while it loads.
 */
export function reloadOnReturn(reload: () => void): void {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
  const doc = inject(DOCUMENT);
  let last = Date.now();
  const back = () => {
    if (doc.visibilityState !== 'visible' || Date.now() - last < QUIET_MS) return;
    last = Date.now();
    reload();
  };
  doc.addEventListener('visibilitychange', back);
  doc.defaultView?.addEventListener('focus', back);
  inject(DestroyRef).onDestroy(() => {
    doc.removeEventListener('visibilitychange', back);
    doc.defaultView?.removeEventListener('focus', back);
  });
}

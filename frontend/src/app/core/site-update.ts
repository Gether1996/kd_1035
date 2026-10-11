import { DOCUMENT, Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NavigationError, NavigationStart, Router } from '@angular/router';

/** the app shell of the deployed build (served with no-cache) – it names the current main-<hash>.js */
const SHELL = '/index.csr.html';
const MAIN = /main-[A-Z0-9]+\.js/;
/** checks at most this often: on return to the tab, before a navigation and while the tab stays open */
const QUIET_MS = 60_000;
const EVERY_MS = 10 * 60_000;
/** a failed lazy chunk loads its page fresh at most once per address within this time (no reload loop) */
const RETRY_MS = 10_000;
const RETRY_KEY = 'kd1035.reloaded';

/**
 * Old tabs after a deploy (Gether 11. 10. 2026: a player's open tab still offered the armaments screenshot the server
 * no longer takes). The page compares its own main-<hash>.js with the deployed shell's; when a newer build is out,
 * the next click on a link loads the page fresh (nothing typed is lost mid-form) and a bar offers to reload now.
 * A lazy page whose chunk the deploy removed is loaded fresh too. Cookies and the remembered language stay.
 */
@Injectable({ providedIn: 'root' })
export class SiteUpdate {
  /** a newer build is deployed than the one running in this tab */
  readonly available = signal(false);

  private readonly doc = inject(DOCUMENT);
  private readonly router = inject(Router);
  private running: string | null = null;
  private last = 0;

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    this.running = this.doc.querySelector('script[src*="main-"]')?.getAttribute('src')?.match(MAIN)?.[0] ?? null;
    // ng serve has no hashed bundle – nothing to compare
    if (!this.running) return;
    this.last = Date.now();

    this.router.events.subscribe((e) => {
      if (e instanceof NavigationStart && e.navigationTrigger === 'imperative' && this.available()) {
        // a newer build: load the target page from the server instead of the old bundle
        location.assign(e.url);
      } else if (e instanceof NavigationStart) {
        this.check();
      } else if (e instanceof NavigationError && chunkMissing(e.error)) {
        this.reloadOnce(e.url);
      }
    });
    this.doc.addEventListener('visibilitychange', () => {
      if (this.doc.visibilityState === 'visible') this.check();
    });
    // a phone restoring the tab from the back/forward cache
    this.doc.defaultView?.addEventListener('pageshow', (e) => e.persisted && this.check());
    setInterval(() => this.doc.visibilityState === 'visible' && this.check(true), EVERY_MS);
  }

  /** asks the server for the deployed shell (at most once a minute unless `force`) */
  async check(force = false): Promise<void> {
    if (!this.running || this.available() || (!force && Date.now() - this.last < QUIET_MS)) return;
    this.last = Date.now();
    try {
      const response = await fetch(SHELL, { cache: 'no-store' });
      if (!response.ok) return;
      const deployed = (await response.text()).match(MAIN)?.[0];
      if (deployed && deployed !== this.running) this.available.set(true);
    } catch {
      // offline or the server is restarting – the next check tries again
    }
  }

  reload(): void {
    location.reload();
  }

  private reloadOnce(url: string): void {
    try {
      const [at, previous] = (sessionStorage.getItem(RETRY_KEY) ?? '').split(' ');
      if (previous === url && Date.now() - Number(at) < RETRY_MS) return;
      sessionStorage.setItem(RETRY_KEY, `${Date.now()} ${url}`);
    } catch {
      // storage blocked – load it fresh anyway (a loop needs the chunk missing in the new build too)
    }
    location.assign(url);
  }
}

/** the bundle of a lazy page is gone (Chrome, Firefox, Safari wording) */
function chunkMissing(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /dynamically imported module|Importing a module script failed|Loading chunk/i.test(message);
}

import { test as base, expect, type Page, type Response } from '@playwright/test';

/** The site under test is the production build behind nginx (status codes, headers, sitemap, link previews). */
export const PROD = process.env.PROD === '1';
/** Signed in as the temporary test player (run.sh --player / manage.py test_session). */
export const SESSION = process.env.SESSION ?? '';

type Guard = {
  /** Problems seen so far: JS errors, console errors, 5xx answers, failed requests. */
  readonly problems: string[];
  /** Expected problems of this test (e.g. the 404 of a page that must not exist). */
  allow(pattern: RegExp): void;
};

let tests = 0;

export const test = base.extend<{ guard: Guard }>({
  // Every test fails on an error in the browser – a broken page often only shows there.
  guard: [
    async ({ page }, use, testInfo) => {
      const problems: string[] = [];
      const allowed: RegExp[] = [];
      page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
      page.on('console', (m) => {
        if (m.type() === 'error') problems.push(`console error: ${m.text()}`);
      });
      page.on('response', (r) => {
        if (r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.url()}`);
      });
      page.on('requestfailed', (r) => {
        const why = r.failure()?.errorText ?? '';
        // navigations and fetches cut short by the next navigation are normal
        if (!/ERR_ABORTED|NS_BINDING_ABORTED|cancelled|Load request cancelled/i.test(why)) {
          problems.push(`request failed: ${r.url()} ${why}`);
        }
      });
      const host = new URL(testInfo.project.use.baseURL ?? 'http://localhost').hostname;
      if (PROD && /^(localhost|127\.|host\.docker\.internal$)/.test(host)) {
        // our own production stack (CI, run.sh --prod): nginx limits the API per client address and takes it from
        // X-Forwarded-For of a private network – every test gets its own (TEST-NET-3) address, so parallel tests from
        // one machine are not throttled into 429s. Never sent to the live site, where the limits must hold.
        const address = (testInfo.workerIndex * 37 + tests++) % 254;
        await page.context().setExtraHTTPHeaders({ 'X-Forwarded-For': `203.0.113.${address + 1}` });
      }
      // only the signed-in tests; everything else is an anonymous visitor
      if (SESSION && testInfo.tags.includes('@player')) {
        const url = new URL(testInfo.project.use.baseURL ?? 'http://localhost:4200');
        await page.context().addCookies([{ name: 'sessionid', value: SESSION, url: url.origin }]);
      }
      // the dev build logs a view transition cut short by the next navigation (typing in a search); production does not
      if (!PROD) allowed.push(/Transition was skipped/);
      await use({ problems, allow: (pattern) => allowed.push(pattern) });
      const left = problems.filter((p) => !allowed.some((pattern) => pattern.test(p)));
      expect(left, 'errors in the browser').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Opens a page and waits until the API calls are done (sections that load from the API are in place). */
export async function open(page: Page, path: string): Promise<Response | null> {
  const response = await page.goto(path, { waitUntil: 'networkidle' });
  await page.locator('app-root main').waitFor();
  return response;
}

/**
 * Scrolls through the page once and back to the top: `@defer (on viewport)` blocks (commander finder…) load only when
 * they come into view.
 */
export async function scrollThrough(page: Page): Promise<void> {
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight * 0.8) {
      scrollTo({ top: y, behavior: 'instant' });
      await new Promise((r) => setTimeout(r, 60));
    }
    scrollTo({ top: 0, behavior: 'instant' });
  });
  await page.waitForLoadState('networkidle');
}

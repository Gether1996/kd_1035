// What players actually do: menu, language, guides, calendar, back button, keyboard – and the site without its API.
import type { Page } from '@playwright/test';
import { PROD, expect, open, test } from './fixtures';

/** How far (px) a section's top is from the bottom of the fixed header – 0 when a section link landed right. */
const belowHeader = (page: Page, selector: string) =>
  page.evaluate((selector) => {
    const header = document.querySelector('app-header')!.getBoundingClientRect().height;
    const section = document.querySelector(selector);
    return section ? Math.abs(section.getBoundingClientRect().top - header) : Infinity; // not rendered yet
  }, selector);

test.describe('navigation', () => {
  test('the mobile menu opens, navigates, closes with Escape @journey', async ({ page }) => {
    await open(page, '/');
    const burger = page.locator('.burger');
    test.skip(!(await burger.isVisible()), 'the menu is in the bar on this width');

    await burger.click();
    await expect(page.locator('#mobile-menu')).toHaveClass(/is-open/);
    await expect(burger).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(page.locator('#mobile-menu')).not.toHaveClass(/is-open/);
    await expect(burger).toBeFocused(); // the focus goes back to the button

    await burger.click();
    await page.locator('#mobile-menu').getByRole('link', { name: 'Kalendár' }).click();
    await expect(page).toHaveURL(/\/kalendar$/);
    await expect(page.locator('#mobile-menu')).not.toHaveClass(/is-open/);
    await expect(page.locator('h1')).toBeVisible();
  });

  test('the bar links reach every main page @journey', async ({ page }) => {
    await open(page, '/');
    test.skip(await page.locator('.burger').isVisible(), 'phones use the menu (test above)');
    for (const [name, url] of [
      ['O nás', /\/o-nas$/],
      ['Návody', /\/navody$/],
      ['Kalendár', /\/kalendar$/],
    ] as const) {
      await page.locator('app-header .nav').getByRole('link', { name, exact: true }).click();
      await expect(page).toHaveURL(url);
      await expect(page.locator('h1')).toBeVisible();
    }
  });

  test('a shared link to a section stays on it while the page loads @journey', async ({ page }) => {
    // the next events load above #alliance after the browser jumped there and pushed it away (fixed in app.ts)
    await page.goto('/#alliance', { waitUntil: 'networkidle' });
    await expect.poll(() => belowHeader(page, '#alliance')).toBeLessThan(4);
  });

  test('back and forward return to where the visitor was @journey', async ({ page }) => {
    // PR #1 (d4ac49a): forward to /#alliance stopped above the section, back to /o-nas jumped to the top
    await open(page, '/o-nas');
    const contacts = page.locator('main a.step-action[href="/#alliance"]');
    await contacts.scrollIntoViewIfNeeded();
    const left = await page.evaluate(() => Math.round(scrollY));
    expect(left).toBeGreaterThan(300);
    await contacts.click();
    await expect(page).toHaveURL(/\/#alliance$/);
    await expect.poll(() => belowHeader(page, '#alliance')).toBeLessThan(4);

    await page.goBack();
    await expect(page).toHaveURL(/\/o-nas$/);
    await expect.poll(() => page.evaluate(() => Math.round(scrollY))).toBe(left);
    await page.goForward();
    await expect(page).toHaveURL(/\/#alliance$/);
    await expect.poll(() => belowHeader(page, '#alliance')).toBeLessThan(4);
  });

  test('a new page starts at the top @journey', async ({ page }) => {
    await open(page, '/o-nas');
    const terms = page.locator('app-footer a[href="/podmienky"]');
    await terms.scrollIntoViewIfNeeded();
    await terms.click();
    await expect(page).toHaveURL(/\/podmienky$/);
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  });

  test('the skip link moves the keyboard focus to the content @journey', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'Safari tabs only to form fields by default');
    await open(page, '/navody');
    await page.keyboard.press('Tab');
    const skip = page.locator('.skip-link');
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(page.locator('main#main')).toBeFocused();
  });
});

test.describe('language', () => {
  test('the switch keeps the page and the scroll position @journey', async ({ page }) => {
    await open(page, '/o-nas');
    await page.evaluate(() => scrollTo({ top: 600, behavior: 'instant' }));
    const switchTo = page.locator('app-header a[hreflang="cs"]:visible, #mobile-menu a[hreflang="cs"]');
    if (!(await page.locator('app-header a[hreflang="cs"]:visible').count())) await page.locator('.burger').click();
    await switchTo.first().click();
    await expect(page).toHaveURL(/\/cz\/o-nas$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'cs');
    await expect(page.locator('h1')).toHaveText(/\S/);
    expect(await page.evaluate(() => localStorage.getItem('kd1035.lang'))).toBe('cs');
  });

  test.describe('in a Czech browser', () => {
    test.use({ locale: 'cs-CZ' });

    test('the home page opens in Czech @journey', async ({ page }) => {
      await page.goto('/', { waitUntil: 'networkidle' });
      await expect(page).toHaveURL(/\/cz$/);
      await expect(page.locator('html')).toHaveAttribute('lang', 'cs');
    });
  });
});

test.describe('guides', () => {
  test('hub → category → guide → breadcrumbs back @journey', async ({ page }) => {
    await open(page, '/navody');
    await page.locator('.tabs').getByRole('link', { name: 'Commanderi' }).click();
    await expect(page).toHaveURL(/\/navody\/commanderi$/);

    const first = page.locator('ol.list a.row').first();
    const title = (await first.locator('strong').textContent())!.trim();
    await first.click();
    await expect(page.locator('h1')).toHaveText(title);
    await expect(page.locator('.prose')).not.toBeEmpty();

    await page.locator('app-breadcrumbs').getByRole('link', { name: 'Commanderi' }).click();
    await expect(page).toHaveURL(/\/navody\/commanderi$/);
  });

  test('the search finds a guide and Escape clears it @journey', async ({ page }) => {
    await open(page, '/navody');
    const search = page.locator('#guide-search');
    await search.fill('jazd');
    const results = page.locator('a.row--result');
    await expect(results.first()).toBeVisible();
    await expect(results.first()).toContainText(/jazd/i);
    await search.press('Escape');
    await expect(results).toHaveCount(0);
    await expect(page.locator('section.group').first()).toBeVisible();
  });

  test('an unknown guide shows the 404 links @journey', async ({ page, guard }) => {
    guard.allow(/status of 404/);
    await open(page, '/navody/commanderi/neexistuje');
    await expect(page.locator('app-not-found-links a')).toHaveCount(2);
  });
});

test.describe('calendar', () => {
  test('an event opens in a dialog, Escape closes it and gives the focus back @journey', async ({ page }) => {
    await open(page, '/kalendar');
    const event = page.locator('button.bar:visible, button.row:visible, button.pill-event:visible').first();
    test.skip(!(await event.count()), 'no event this month');
    await event.click();
    const dialog = page.locator('dialog[open]');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.modal__title')).not.toBeEmpty();
    await expect(page).toHaveURL(/[?&]event=\d+/); // shareable
    await expect(dialog).toBeInViewport({ ratio: 0.5 });
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(event).toBeFocused();
  });

  test('the next and previous month buttons work @journey', async ({ page }) => {
    await open(page, '/kalendar');
    const heading = page.locator('.toolbar__title');
    const now = await heading.textContent();
    await page.getByRole('button', { name: /ďalší|nasledujúci/i }).click();
    await expect(heading).not.toHaveText(now!);
    await page.getByRole('button', { name: /predchádzajúci|predošlý/i }).click();
    await expect(heading).toHaveText(now!);
  });
});

test.describe('without the API', () => {
  test('pages still show and the guides say they could not load @journey', async ({ page, guard }) => {
    // CLAUDE.md: the frontend must work when the API fails – sections hide, nothing breaks
    guard.allow(/request failed: .*\/api\/|Failed to load resource/);
    await page.route('**/api/**', (route) => route.abort('failed'));
    for (const path of ['/', '/navody', '/kalendar', '/o-nas']) {
      await page.goto(path, { waitUntil: 'networkidle' });
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('app-footer')).toBeAttached();
    }
    await page.goto('/navody', { waitUntil: 'networkidle' });
    await expect(page.locator('p.state')).toBeVisible();
  });
});

test.describe('production server', () => {
  test.skip(!PROD, 'nginx only (PROD=1)');

  test('pages are never cached stale, built files forever @journey', async ({ page, request }) => {
    const html = await request.get('/o-nas');
    expect(html.headers()['cache-control']).toContain('no-cache');
    await open(page, '/');
    const script = await page.locator('script[src*="main-"]').first().getAttribute('src');
    const js = await request.get(script!);
    expect(js.headers()['cache-control']).toContain('immutable');
  });

  test('the sitemap lists the guides and robots.txt points at it @journey', async ({ request }) => {
    const sitemap = await request.get('/sitemap.xml');
    expect(sitemap.ok()).toBe(true);
    expect(await sitemap.text()).toContain('/navody/commanderi/pary-pre-jazdu');
    const robots = await request.get('/robots.txt');
    expect(await robots.text()).toMatch(/Sitemap: https?:\/\/[^/\s]+\/sitemap\.xml/);
  });

  test('a Discord link preview shows the guide title @journey', async ({ request }) => {
    const preview = await request.get('/navody/commanderi/pary-pre-jazdu', { headers: { 'User-Agent': 'Discordbot/2.0' } });
    expect(preview.ok()).toBe(true);
    expect(await preview.text()).toMatch(/<meta property="og:title" content="Páry commanderov pre jazdu/);
  });

  test('an unknown address answers 404 @journey', async ({ request }) => {
    expect((await request.get('/xyz')).status()).toBe(404);
    expect((await request.get('/cz/xyz')).status()).toBe(404);
  });
});

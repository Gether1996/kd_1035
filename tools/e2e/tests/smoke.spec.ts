// Smoke: every page loads in both languages, has its heading and meta tags, header and footer, and no errors.
import { ACCOUNT, MISSING, PUBLIC, both } from './pages';
import { PROD, expect, open, test } from './fixtures';

for (const path of both([...PUBLIC, ...ACCOUNT])) {
  test(`${path} loads @smoke`, async ({ page }) => {
    const response = await open(page, path);
    expect(response?.status(), 'HTTP status').toBe(200);

    const lang = path.startsWith('/cz') ? 'cs' : 'sk';
    await expect(page.locator('html')).toHaveAttribute('lang', lang);
    await expect(page.locator('h1:visible'), 'one visible h1').toHaveCount(1);
    await expect(page.locator('h1:visible')).not.toBeEmpty();
    const head = await page.evaluate(() => ({
      title: document.title.trim(),
      description: document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '',
      robots: document.querySelector('meta[name="robots"]')?.getAttribute('content') ?? '',
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? '',
      hreflang: [...document.querySelectorAll('link[rel="alternate"][hreflang]')].map((l) => l.getAttribute('hreflang')),
    }));
    expect(head.title, '<title>').not.toBe('');
    expect(head.description.length, 'meta description length').toBeGreaterThanOrEqual(40);

    // indexed pages point Google at themselves; signed-in pages are noindex without canonical (Seo service)
    if (ACCOUNT.some((p) => path.endsWith(p))) {
      expect(head.robots).toContain('noindex');
      expect(head.canonical).toBe('');
    } else {
      expect(head.robots).not.toContain('noindex');
      expect(new URL(head.canonical).pathname.replace(/(.)\/$/, '$1'), 'canonical').toBe(path);
      expect(head.hreflang.sort()).toEqual(['cs', 'sk', 'x-default']);
    }

    await expect(page.locator('app-header .brand')).toBeVisible();
    const footer = page.locator('app-footer');
    await footer.scrollIntoViewIfNeeded();
    await expect(footer).toBeVisible();
    await expect(footer).toContainText(/v\d+\.\d+\.\d+/); // site version

    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(sideways, 'page scrolls sideways (px)').toBeLessThanOrEqual(0);
  });
}

for (const path of MISSING) {
  test(`${path} shows the 404 page @smoke`, async ({ page, guard }) => {
    guard.allow(/status of 404/);
    const response = await open(page, path);
    // the dev server answers 200 and lets Angular show the page; nginx answers 404
    if (PROD && !path.startsWith('/navody/')) expect(response?.status()).toBe(404);
    await expect(page.locator('html')).toHaveAttribute('lang', path.startsWith('/cz') ? 'cs' : 'sk');
    // a Not Found page must not end up in Google
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    expect(await page.locator('link[rel="canonical"]').count()).toBe(0);
    // the way back: Home + Guides
    await expect(page.locator('app-not-found-links a')).toHaveCount(2);
  });
}

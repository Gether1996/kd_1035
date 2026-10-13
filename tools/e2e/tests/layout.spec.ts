// Responsive layout on every device (playwright.config.ts projects, 320 px phone … 2560 px ultrawide): no sideways
// scrolling, rows that line up, no cut-off text, no stretched images. Tap targets, tiny text and words broken mid-word
// are reported as warnings in the HTML report (annotations), they do not fail the run.
import type { Page, TestInfo } from '@playwright/test';
import { ACCOUNT, PUBLIC, both } from './pages';
import { expect, open, scrollThrough, test } from './fixtures';
import { measure } from './layout';

async function check(page: Page, testInfo: TestInfo) {
  const report = await measure(page);
  const warn = (what: string, list: string[]) => {
    if (list.length) testInfo.annotations.push({ type: 'warning', description: `${what}:\n${list.join('\n')}` });
  };
  expect.soft(report.sideways, `page scrolls sideways; sticking out: ${report.sticking.join(' | ')}`).toBeLessThanOrEqual(0);
  expect.soft(report.misaligned, 'parts of a row off its centre line').toEqual([]);
  expect.soft(report.clipped, 'cut-off text').toEqual([]);
  expect.soft(report.stretched, 'stretched images').toEqual([]);
  warn('tap targets under 24 × 24 px', report.small);
  warn('text under 11 px', report.tiny);
  warn('words broken mid-word (box too narrow)', report.brokenWords);
  if (report.sideways <= 0) warn('boxes outside the viewport (not scrollable, maybe cut off)', report.sticking);
}

for (const path of both([...PUBLIC, ...ACCOUNT])) {
  test(`${path} layout @layout`, async ({ page }, testInfo) => {
    await open(page, path);
    await scrollThrough(page);
    await check(page, testInfo);
  });
}

test('mobile menu layout @layout', async ({ page }, testInfo) => {
  await open(page, '/cz');
  const burger = page.locator('.burger');
  test.skip(!(await burger.isVisible()), 'the menu is in the bar on this width');
  await burger.click();
  await expect(page.locator('#mobile-menu.is-open')).toBeVisible();
  await check(page, testInfo);
});

test('calendar event dialog layout @layout', async ({ page }, testInfo) => {
  await open(page, '/cz/kalendar');
  const event = page.locator('button.bar:visible, button.row:visible, button.pill-event:visible').first();
  test.skip(!(await event.count()), 'no event in this month');
  await event.click();
  await expect(page.locator('dialog[open]')).toBeVisible();
  await check(page, testInfo);
});

test('guide search results layout @layout', async ({ page }, testInfo) => {
  await open(page, '/cz/navody');
  await page.locator('#guide-search').fill('jízd');
  await expect(page.locator('a.row--result').first()).toBeVisible();
  await check(page, testInfo);
});

// End-to-end, smoke and responsive layout tests of the KD 1035 website. How to run: docs/qa.md (or tools/e2e/run.sh).
//   BASE_URL=http://localhost:4200   site under test (default: the dev server; CI: the production stack on :9005)
//   PROD=1                           the site is the production build behind nginx: also checks status codes (404),
//                                    headers, the sitemap and link previews, which the dev server does not serve
//   PW_CHANNEL=chrome                use the installed Google Chrome instead of Playwright's Chromium (no download)
//   SESSION=<sessionid>              also run the signed-in tests (run.sh --player makes a temporary test player)
// Projects = devices. Tags pick what runs where: @layout on every device, @smoke and @journey on a phone, an iPhone
// and a laptop (the tablet also gets @smoke), @player only with SESSION.
import { defineConfig, devices } from '@playwright/test';

const channel = process.env.PW_CHANNEL || undefined;
const android = devices['Pixel 7'];
const layoutOnly = /@layout/;
const everything = /@layout|@smoke|@journey|@player/;

export default defineConfig({
  testDir: 'tests',
  outputDir: 'out/results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // out/run.json feeds `node summary.mjs` (failures and warnings in a few lines), out/report is the clickable report
  reporter: [
    ...(process.env.CI ? [['github'] as const] : []),
    ['list'],
    ['json', { outputFile: 'out/run.json' }],
    ['html', { outputFolder: 'out/report', open: 'never' }],
  ],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:4200',
    // the scroll reveals show at once and nothing is mid-transition: stable boxes for the layout checks
    reducedMotion: 'reduce',
    // a Czech browser would be sent to /cz (I18n.preferred) – the language tests set their own locale
    locale: 'sk-SK',
    timezoneId: 'Europe/Bratislava',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // the narrowest phone we support (CLAUDE.md: mobile from 320 px)
    { name: 'phone-320', grep: layoutOnly, use: { ...android, viewport: { width: 320, height: 640 }, channel } },
    { name: 'phone', grep: everything, use: { ...android, viewport: { width: 360, height: 780 }, channel } },
    // Safari engine: iPhones (Chrome on iOS renders with WebKit too) – images in grid/flex, sticky, dialogs
    { name: 'iphone', grep: everything, use: { ...devices['iPhone 15'] } },
    { name: 'phone-landscape', grep: layoutOnly, use: { ...android, viewport: { width: 844, height: 390 }, channel } },
    { name: 'tablet', grep: /@layout|@smoke/, use: { viewport: { width: 768, height: 1024 }, hasTouch: true, channel } },
    { name: 'desktop', grep: everything, use: { viewport: { width: 1280, height: 800 }, channel } },
    { name: 'wide', grep: layoutOnly, use: { viewport: { width: 2560, height: 1080 }, channel } },
  ],
});

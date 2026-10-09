// Screenshots of the running site at several viewport sizes (responsive QA).
// Run it through tools/screenshots/shoot.sh (dev server must be up), which passes these variables to the container:
//   PAGES=/,/cz/o-nas           paths, comma separated
//   SIZES=360x780,1280x800      viewports (default 360, 768, 1280, 1920, 2560)
//   FULL=0                      only the viewport instead of the full page
//   SELECTOR=.footer            screenshot only the first element matching this CSS selector
//   MEASURE=.brand,.nav,.account  print each element's box (x, width, right) and whether its content overflows
//   SHOT=0                      no images, only MEASURE and the overflow check (fast)
//   SESSION=<sessionid>         signed in as that user (shoot.sh --player / --superuser makes a test player)
// Every page also reports OVERFLOW when it scrolls sideways.
// Output: tools/screenshots/out/<page>[-<selector>]-<width>x<height>.png  (git-ignored)
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://host.docker.internal:4200';
const PAGES = (process.env.PAGES ?? '/,/cz/o-nas').split(',');
const SIZES = (process.env.SIZES ?? '360x780,768x1024,1280x800,1920x1080,2560x1080')
  .split(',')
  .map((s) => s.split('x').map(Number));
const FULL = process.env.FULL !== '0';
const SHOT = process.env.SHOT !== '0';
const SELECTOR = process.env.SELECTOR;
const MEASURE = process.env.MEASURE ? process.env.MEASURE.split(',') : [];
const SESSION = process.env.SESSION;

mkdirSync('out', { recursive: true });
const browser = await chromium.launch();

for (const path of PAGES) {
  for (const [width, height] of SIZES) {
    const context = await browser.newContext({ viewport: { width, height } });
    if (SESSION) await context.addCookies([{ name: 'sessionid', value: SESSION, url: BASE }]);
    const page = await context.newPage();
    page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
    page.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text()));
    await page.goto(BASE + path, { waitUntil: 'networkidle' });
    if (SHOT) {
      // scroll through once so reveal animations and count-ups run, then back to top
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += innerHeight / 2) {
          scrollTo({ top: y, behavior: 'instant' });
          await new Promise((r) => setTimeout(r, 120));
        }
        scrollTo({ top: 0, behavior: 'instant' });
        await new Promise((r) => setTimeout(r, 2200));
      });
    }

    const where = `${path} ${width}x${height}`;
    const wider = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (wider > 0) console.log(`OVERFLOW ${where}: the page is ${wider}px wider than the viewport`);
    const boxes = await page.evaluate(
      (selectors) =>
        selectors.map((selector) => {
          const el = document.querySelector(selector);
          if (!el) return `${selector} missing`;
          const r = el.getBoundingClientRect();
          if (!r.width && !r.height) return `${selector} hidden`;
          const cut = el.scrollWidth - el.clientWidth > 1 ? ` OVERFLOWS by ${el.scrollWidth - el.clientWidth}px` : '';
          return `${selector} x=${Math.round(r.left)} w=${Math.round(r.width)} right=${Math.round(r.right)}${cut}`;
        }),
      MEASURE,
    );
    for (const box of boxes) console.log(`${where}  ${box}`);

    if (SHOT) {
      const part = SELECTOR ? `-${SELECTOR.replace(/[^\w-]+/g, '')}` : '';
      const name = `out/${path.replace(/\//g, '_') || '_'}${part}-${width}x${height}.png`;
      if (SELECTOR) await page.locator(SELECTOR).first().screenshot({ path: name, timeout: 5000 });
      else await page.screenshot({ path: name, fullPage: FULL });
      console.log(name);
    }
    await context.close();
  }
}
await browser.close();

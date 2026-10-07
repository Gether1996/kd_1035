// Full-page screenshots of the running site at several viewport sizes (responsive QA).
// Run (dev server must be up):
//   docker run --rm --add-host=host.docker.internal:host-gateway -v "$PWD:/work" -w /work \
//     mcr.microsoft.com/playwright:v1.63.0-noble sh -c "cd tools/screenshots && npm i --no-save playwright@1.63.0 >/dev/null && node shoot.mjs"
// Output: tools/screenshots/out/<page>-<width>x<height>.png  (git-ignored)
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://host.docker.internal:4200';
const PAGES = (process.env.PAGES ?? '/,/cz/o-nas').split(',');
const SIZES = (process.env.SIZES ?? '360x780,768x1024,1280x800,1920x1080,2560x1080')
  .split(',')
  .map((s) => s.split('x').map(Number));
const FULL = process.env.FULL !== '0';

mkdirSync('out', { recursive: true });
const browser = await chromium.launch();

for (const path of PAGES) {
  for (const [width, height] of SIZES) {
    const page = await browser.newPage({ viewport: { width, height } });
    page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
    page.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text()));
    await page.goto(BASE + path, { waitUntil: 'networkidle' });
    // scroll through once so reveal animations and count-ups run, then back to top
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += innerHeight / 2) {
        scrollTo({ top: y, behavior: 'instant' });
        await new Promise((r) => setTimeout(r, 120));
      }
      scrollTo({ top: 0, behavior: 'instant' });
      await new Promise((r) => setTimeout(r, 2200));
    });
    const name = `out/${path.replace(/\//g, '_') || '_'}-${width}x${height}.png`;
    await page.screenshot({ path: name, fullPage: FULL });
    console.log(name);
    await page.close();
  }
}
await browser.close();

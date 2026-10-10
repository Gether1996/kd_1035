// Accessibility audit (axe-core, WCAG 2.1 A + AA) of the running site at several viewport sizes.
// Run it through tools/a11y/audit.sh (dev server must be up), which passes these variables to the container:
//   PAGES=/,/kalendar           paths, comma separated (default: every public page, plus /ucet and /pripomienky when signed in)
//   SIZES=360x780,1280x800      viewports (default 360x780 and 1280x800)
//   STATES=0                    skip the interactive states (event dialog, commander finder, mobile menu)
//   SESSION=<sessionid>         signed in as that user (audit.sh --player / --superuser makes a test player)
// Interactive states, each audited only inside the part it opens:
//   dialog  calendar pages: the first event (month bar or agenda row) clicked, <dialog> open
//   finder  pages with the commander finder: 'att' typed, listbox open
//   menu    / and /cz below 900 px: burger clicked, mobile menu open
// Prints one line per violated rule (page, viewport, rule, impact, nodes, first selector) and exits 1
// when any critical or serious violation exists. Full axe results: tools/a11y/out/<page>-<size>[-<state>].json (git-ignored).
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';

const BASE = process.env.BASE_URL ?? 'http://host.docker.internal:4200';
const SESSION = process.env.SESSION;
const PUBLIC = [
  '/',
  '/cz',
  '/o-nas',
  '/navody',
  '/navody/commanderi',
  '/navody/commanderi/pary-pre-jazdu',
  '/navody/tipy',
  '/kalendar',
  '/cz/kalendar',
  '/podmienky',
  '/ochrana-udajov',
  '/xyz',
];
const PAGES = process.env.PAGES ? process.env.PAGES.split(',') : [...PUBLIC, ...(SESSION ? ['/ucet', '/pripomienky'] : [])];
const SIZES = (process.env.SIZES ?? '360x780,1280x800').split(',').map((s) => s.split('x').map(Number));
const STATES = process.env.STATES !== '0';
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const BLOCKING = new Set(['critical', 'serious']);

/** Interactive states: `when` decides whether the state applies, `open` gets the page there, `scope` is what axe checks. */
const STATE_LIST = [
  {
    name: 'dialog',
    when: (path) => path.includes('kalendar'),
    async open(page) {
      await page.locator('button.bar:visible, button.row:visible, button.pill-event:visible').first().click();
      await page.locator('dialog[open]').waitFor();
      await page.mouse.move(0, 0); // the click left the pointer over the sheet: a hover depends on the layout
      await page.waitForTimeout(600); // fade-in, otherwise axe measures half-transparent text
    },
    scope: 'dialog[open]',
  },
  {
    name: 'finder',
    when: async (path, page) => (await page.locator('#finder-input').count()) > 0,
    async open(page) {
      await page.locator('#finder-input').click();
      await page.locator('#finder-input').pressSequentially('att');
      await page.locator('#finder-options:not([hidden])').waitFor();
    },
    scope: '.finder',
  },
  {
    name: 'menu',
    when: async (path, page) => (path === '/' || path === '/cz') && (await page.locator('.burger').isVisible()),
    async open(page) {
      await page.locator('.burger').click();
      await page.locator('#mobile-menu.is-open').waitFor();
      await page.waitForTimeout(600); // drawer transition
    },
    scope: '#mobile-menu',
  },
];

mkdirSync('out', { recursive: true });
const browser = await chromium.launch();
const rows = [];
let audits = 0;

async function audit(page, path, size, state, scope) {
  let builder = new AxeBuilder({ page }).withTags(TAGS);
  if (scope) builder = builder.include(scope);
  const result = await builder.analyze();
  audits++;
  const label = state ? `${path} [${state}]` : path;
  const file = `out/${path.replace(/\//g, '_') || '_'}-${size}${state ? `-${state}` : ''}.json`;
  writeFileSync(file, JSON.stringify(result, null, 2));
  for (const v of result.violations) {
    rows.push({ page: label, size, rule: v.id, impact: v.impact ?? '?', nodes: v.nodes.length, selector: v.nodes[0]?.target.join(' ') ?? '' });
  }
}

async function load(context, path) {
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('PAGE ERROR', path, e.message));
  await page.goto(BASE + path, { waitUntil: 'networkidle' });
  // scroll through once so reveal animations run (hidden text would skew the contrast check), then back to top
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += innerHeight / 2) {
      scrollTo({ top: y, behavior: 'instant' });
      await new Promise((r) => setTimeout(r, 100));
    }
    scrollTo({ top: 0, behavior: 'instant' });
    await new Promise((r) => setTimeout(r, 1500));
  });
  return page;
}

for (const path of PAGES) {
  for (const [width, height] of SIZES) {
    const size = `${width}x${height}`;
    const context = await browser.newContext({ viewport: { width, height } });
    if (SESSION) await context.addCookies([{ name: 'sessionid', value: SESSION, url: BASE }]);
    let page = await load(context, path);
    await audit(page, path, size);

    if (STATES) {
      for (const state of STATE_LIST) {
        if (!(await state.when(path, page))) continue;
        await page.close();
        page = await load(context, path); // fresh page, so states do not leak into each other
        try {
          await state.open(page);
          await audit(page, path, size, state.name, state.scope);
        } catch (e) {
          console.log(`STATE FAILED ${path} ${size} [${state.name}]: ${e.message.split('\n')[0]}`);
          rows.push({ page: `${path} [${state.name}]`, size, rule: 'state-not-reached', impact: 'serious', nodes: 0, selector: '' });
        }
      }
    }
    await context.close();
  }
}
await browser.close();

// summary table
const head = { page: 'page', size: 'viewport', rule: 'rule', impact: 'impact', nodes: 'count', selector: 'first selector' };
const cols = ['page', 'size', 'rule', 'impact', 'nodes'];
const width = Object.fromEntries(cols.map((c) => [c, Math.max(...[head, ...rows].map((r) => String(r[c]).length))]));
const line = (r) => cols.map((c) => String(r[c]).padEnd(width[c])).join('  ') + '  ' + r.selector;
const order = { critical: 0, serious: 1, moderate: 2, minor: 3 };
rows.sort((a, b) => (order[a.impact] ?? 9) - (order[b.impact] ?? 9) || a.rule.localeCompare(b.rule) || a.page.localeCompare(b.page));
if (rows.length) {
  console.log(line(head));
  for (const r of rows) console.log(line(r));
}
const blocking = rows.filter((r) => BLOCKING.has(r.impact));
console.log(
  `\n${audits} audits (pages × viewports + states), ${rows.length} violated rule(s): ` +
    `${blocking.length} critical/serious, ${rows.length - blocking.length} moderate/minor. Full results: tools/a11y/out/`,
);
process.exit(blocking.length ? 1 : 0);

// Splits the built app shell (index.csr.html) for the guide pages, which are rendered in the browser.
// nginx proxies /[cz/]navody/<category>/<slug> to Django (guides.views.guide_page); Django answers with the guide's
// title, description, canonical, hreflang, Open Graph and JSON-LD (or a 404 with noindex) between two SSI includes:
//   guide-shell/<lang>.head.html – the shell up to </head>, without its <title>, <html lang> set to the language
//   guide-shell/<lang>.tail.html – </head> and the rest
// so search engines get the guide's own meta without JavaScript, and the page always loads the deployed build.
// Run after `ng build` (frontend/Dockerfile); the build fails here when the shell no longer has the expected shape.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = process.argv[2] ?? 'dist/frontend/browser';
const shell = readFileSync(join(dist, 'index.csr.html'), 'utf8');

const title = /<title>[^<]*<\/title>\s*/;
const end = shell.indexOf('</head>');
if (!title.test(shell) || end < 0 || !/<html lang="sk"/.test(shell)) {
  throw new Error('guide-shell: index.csr.html has no <title>, </head> or <html lang="sk">');
}

const out = join(dist, 'guide-shell');
mkdirSync(out, { recursive: true });
for (const lang of ['sk', 'cs']) {
  const head = shell.slice(0, end).replace(title, '').replace('<html lang="sk"', `<html lang="${lang}"`);
  writeFileSync(join(out, `${lang}.head.html`), head);
  writeFileSync(join(out, `${lang}.tail.html`), shell.slice(end));
}
console.log(`guide-shell: ${out}/{sk,cs}.{head,tail}.html`);

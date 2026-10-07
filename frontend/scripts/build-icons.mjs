// Builds public/icons.svg – one SVG sprite with every icon the site uses.
// Run: npm run icons   (Lucide icons: ISC license, Simple Icons: CC0)
import { readFileSync, writeFileSync } from 'node:fs';

const modules = new URL('../node_modules/', import.meta.url);
const lucideDir = new URL('lucide-static/icons/', modules);
const simpleDir = new URL('simple-icons/icons/', modules);

const LUCIDE = [
  'arrow-right', 'calendar-days', 'chevron-down', 'crown', 'flag', 'flame', 'gift', 'hand-helping',
  'languages', 'map', 'menu', 'shield', 'swords', 'users', 'x',
];
const BRANDS = ['discord', 'facebook'];

const inner = (svg) =>
  svg.slice(svg.indexOf('>', svg.indexOf('<svg')) + 1, svg.lastIndexOf('</svg>')).replace(/\s*\n\s*/g, '');

const symbols = [
  ...LUCIDE.map((name) => {
    const svg = readFileSync(new URL(`${name}.svg`, lucideDir), 'utf8');
    return `<symbol id="${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">${inner(svg)}</symbol>`;
  }),
  ...BRANDS.map((name) => {
    const svg = readFileSync(new URL(`${name}.svg`, simpleDir), 'utf8');
    return `<symbol id="${name}" viewBox="0 0 24 24" fill="currentColor">${inner(svg).replace(/<title>.*?<\/title>/, '')}</symbol>`;
  }),
];

writeFileSync(
  new URL('../public/icons.svg', import.meta.url),
  `<svg xmlns="http://www.w3.org/2000/svg"><!-- Lucide (ISC) + Simple Icons (CC0) -->${symbols.join('')}</svg>\n`,
);
console.log(`icons.svg: ${symbols.length} icons`);

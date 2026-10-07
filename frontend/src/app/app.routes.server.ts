import { RenderMode, ServerRoute } from '@angular/ssr';
import { GUIDE_CATEGORIES } from './core/i18n/i18n';

const categories = async () => GUIDE_CATEGORIES.map((category) => ({ category }));

export const serverRoutes: ServerRoute[] = [
  // single guides come from the database → rendered in the browser (nginx serves index.csr.html)
  { path: 'navody/:category/:slug', renderMode: RenderMode.Client },
  { path: 'cz/navody/:category/:slug', renderMode: RenderMode.Client },
  // category pages are fixed → prerendered, their lists load in the browser
  { path: 'navody/:category', renderMode: RenderMode.Prerender, getPrerenderParams: categories },
  { path: 'cz/navody/:category', renderMode: RenderMode.Prerender, getPrerenderParams: categories },
  { path: '**', renderMode: RenderMode.Prerender },
];

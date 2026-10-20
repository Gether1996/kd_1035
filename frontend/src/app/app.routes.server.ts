import { RenderMode, ServerRoute } from '@angular/ssr';
import { GUIDE_CATEGORIES } from './core/i18n/i18n';

const categories = async () => GUIDE_CATEGORIES.map((category) => ({ category }));

export const serverRoutes: ServerRoute[] = [
  // single guides come from the database → rendered in the browser; nginx serves the app shell with the guide's
  // meta from Django (guides.views.guide_page, scripts/guide-shell.mjs)
  { path: 'navody/:category/:slug', renderMode: RenderMode.Client },
  { path: 'cz/navody/:category/:slug', renderMode: RenderMode.Client },
  // category pages are fixed → prerendered, their lists load in the browser
  { path: 'navody/:category', renderMode: RenderMode.Prerender, getPrerenderParams: categories },
  { path: 'cz/navody/:category', renderMode: RenderMode.Prerender, getPrerenderParams: categories },
  { path: '**', renderMode: RenderMode.Prerender },
];

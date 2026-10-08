import { Routes } from '@angular/router';
import { About } from './pages/about/about';
import { Account } from './pages/account/account';
import { Calendar } from './pages/calendar/calendar';
import { GuideList } from './pages/guides/guide-list';
import { GuidePage } from './pages/guides/guide-page';
import { Home } from './pages/home/home';
import { NotFound } from './pages/not-found/not-found';
import { Privacy } from './pages/privacy/privacy';
import { Terms } from './pages/terms/terms';

// Same pages in both languages: Slovak at the root, Czech under /cz (see I18n).
const pages = (): Routes => [
  { path: '', component: Home },
  { path: 'o-nas', component: About },
  { path: 'kalendar', component: Calendar },
  { path: 'podmienky', component: Terms },
  { path: 'ochrana-udajov', component: Privacy },
  { path: 'ucet', component: Account },
  { path: 'navody/:category', component: GuideList },
  { path: 'navody/:category/:slug', component: GuidePage },
];

// Unknown addresses keep their URL and show the 404 page; each wildcard must stay the last route of its level.
export const routes: Routes = [
  { path: 'cz', children: [...pages(), { path: '**', component: NotFound }] },
  ...pages(),
  { path: '**', component: NotFound },
];

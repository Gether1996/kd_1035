import { Routes } from '@angular/router';
import { About } from './pages/about/about';
import { Account } from './pages/account/account';
import { Calendar } from './pages/calendar/calendar';
import { Home } from './pages/home/home';
import { NotFound } from './pages/not-found/not-found';
import { Privacy } from './pages/privacy/privacy';
import { RemindersPage } from './pages/reminders/reminders-page';
import { Terms } from './pages/terms/terms';

// Same pages in both languages: Slovak at the root, Czech under /cz (see I18n).
const pages = (): Routes => [
  { path: '', component: Home },
  { path: 'o-nas', component: About },
  { path: 'kalendar', component: Calendar },
  { path: 'podmienky', component: Terms },
  { path: 'ochrana-udajov', component: Privacy },
  { path: 'ucet', component: Account },
  { path: 'pripomienky', component: RemindersPage },
  // guides are loaded on demand: the initial bundle stays within its 600 kB budget (angular.json)
  { path: 'navody', loadComponent: () => import('./pages/guides/guide-hub').then((m) => m.GuideHub) },
  { path: 'navody/:category', loadComponent: () => import('./pages/guides/guide-list').then((m) => m.GuideList) },
  {
    path: 'navody/:category/:slug',
    loadComponent: () => import('./pages/guides/guide-page').then((m) => m.GuidePage),
  },
];

// Unknown addresses keep their URL and show the 404 page; each wildcard must stay the last route of its level.
export const routes: Routes = [
  { path: 'cz', children: [...pages(), { path: '**', component: NotFound }] },
  ...pages(),
  { path: '**', component: NotFound },
];

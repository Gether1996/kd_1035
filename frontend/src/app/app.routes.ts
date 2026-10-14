import { Routes } from '@angular/router';
import { About } from './pages/about/about';
import { leaveEvaluation } from './pages/evaluation/leave-guard';
import { Home } from './pages/home/home';
import { NotFound } from './pages/not-found/not-found';
import { Privacy } from './pages/privacy/privacy';
import { Terms } from './pages/terms/terms';

// Same pages in both languages: Slovak at the root, Czech under /cz (see I18n).
const pages = (): Routes => [
  { path: '', component: Home },
  { path: 'o-nas', component: About },
  // pages with a lot of code of their own are loaded on demand: the initial bundle stays within its 600 kB budget
  // (angular.json); they are prerendered all the same
  { path: 'kalendar', loadComponent: () => import('./pages/calendar/calendar').then((m) => m.Calendar) },
  { path: 'podmienky', component: Terms },
  { path: 'ochrana-udajov', component: Privacy },
  { path: 'ucet', loadComponent: () => import('./pages/account/account').then((m) => m.Account) },
  {
    path: 'pripomienky',
    loadComponent: () => import('./pages/reminders/reminders-page').then((m) => m.RemindersPage),
  },
  {
    path: 'marche',
    loadComponent: () => import('./pages/players-marches/players-marches').then((m) => m.PlayersMarches),
  },
  { path: 'kvk', loadComponent: () => import('./pages/kvk/kvk-page').then((m) => m.KvkPage) },
  // the superadmin's KvK evaluation (Gether 13. 10. 2026)
  {
    path: 'vyhodnocovanie',
    loadComponent: () => import('./pages/evaluation/evaluation-page').then((m) => m.EvaluationPage),
    // unsaved Premenné are not dropped by a click elsewhere (14. 10. 2026)
    canDeactivate: [leaveEvaluation],
  },
  { path: 'slovnik', loadComponent: () => import('./pages/glossary/glossary').then((m) => m.Glossary) },
  // guides too
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

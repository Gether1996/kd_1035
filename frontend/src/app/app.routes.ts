import { Routes } from '@angular/router';
import { About } from './pages/about/about';
import { Home } from './pages/home/home';

// Same pages in both languages: Slovak at the root, Czech under /cz (see I18n.path).
const pages = (): Routes => [
  { path: '', component: Home },
  { path: 'o-nas', component: About },
];

export const routes: Routes = [
  { path: 'cz', children: pages() },
  ...pages(),
  { path: '**', redirectTo: '' },
];

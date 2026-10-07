import { provideHttpClient, withFetch } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  withInMemoryScrolling,
  withRouterConfig,
  withViewTransitions,
} from '@angular/router';
import { routes } from './app.routes';

const leaf = (s: ActivatedRouteSnapshot): ActivatedRouteSnapshot => (s.firstChild ? leaf(s.firstChild) : s);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withFetch()),
    provideClientHydration(withEventReplay()),
    provideRouter(
      routes,
      // scroll-to-top for page changes is handled in App, so switching language keeps the position
      withInMemoryScrolling({ anchorScrolling: 'enabled', scrollPositionRestoration: 'disabled' }),
      // clicking the same section link twice scrolls again
      withRouterConfig({ onSameUrlNavigation: 'reload' }),
      withViewTransitions({
        skipInitialTransition: true,
        onViewTransitionCreated: ({ transition, from, to }) => {
          // jumping to a section on the same page needs no cross-fade
          const same = leaf(from).routeConfig === leaf(to).routeConfig;
          const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
          if (same || reduce) transition.skipTransition();
        },
      }),
    ),
  ],
};

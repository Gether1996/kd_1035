import { provideHttpClient, withFetch, withXsrfConfiguration } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  withComponentInputBinding,
  withInMemoryScrolling,
  withRouterConfig,
  withViewTransitions,
} from '@angular/router';
import { routes } from './app.routes';

const leaf = (s: ActivatedRouteSnapshot): ActivatedRouteSnapshot => (s.firstChild ? leaf(s.firstChild) : s);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Django's CSRF cookie → header on POST/DELETE (logout, deleting the account)
    provideHttpClient(withFetch(), withXsrfConfiguration({ cookieName: 'csrftoken', headerName: 'X-CSRFToken' })),
    provideClientHydration(withEventReplay()),
    provideRouter(
      routes,
      withComponentInputBinding(),
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

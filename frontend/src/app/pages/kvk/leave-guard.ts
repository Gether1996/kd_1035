import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID, inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
// a type only: the routes must not pull the page out of its lazy chunk
import type { KvkPage } from './kvk-page';

const path = (url: string) => url.split(/[?#]/)[0];

/** leaving /kvk with an unsaved sign-up asks first (a header link, back, the language switch; 3. 11. 2026); a change of
 * the query only (?tab=, ?hrac=, the list's filters) stays on the page and never asks, nor does the server */
export const leaveKvk: CanDeactivateFn<KvkPage> = (page, _route, current, next) =>
  !isPlatformBrowser(inject(PLATFORM_ID)) || !page || path(next.url) === path(current.url) || page.canLeave();

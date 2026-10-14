import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID, inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
// a type only: the routes must not pull the page out of its lazy chunk
import type { EvaluationPage } from './evaluation-page';

/** leaving /vyhodnocovanie with unsaved Premenné asks first (a header link, back, the language switch); the server
 * never asks */
export const leaveEvaluation: CanDeactivateFn<EvaluationPage> = (page) =>
  !isPlatformBrowser(inject(PLATFORM_ID)) || !page || page.canLeave();

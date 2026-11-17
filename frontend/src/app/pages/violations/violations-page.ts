import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject } from '@angular/core';
import { Auth } from '../../core/auth';
import { I18n } from '../../core/i18n/i18n';
import { Seo } from '../../core/seo';
import { PageHeader } from '../../shared/page-header';
import { VIOLATION_TEXTS } from './texts';
import { Violations } from './violations';

/**
 * /priestupky – yellow cards for rule violations (Gether 18. 11. 2026, after the talk on Discord). A prerendered shell,
 * not indexed, not in the sitemap; the cards themselves are the superadmin's and the players' with the switch
 * "Priestupky" on /hraci (the API refuses everyone else).
 */
@Component({
  selector: 'app-violations-page',
  imports: [PageHeader, Violations],
  template: `
    @let x = v();
    <app-page-header [crumbs]="crumbs()" [eyebrow]="x.eyebrow" [title]="x.title" [intro]="x.lead" />

    <div class="container content is-wide">
      @if (!auth.ready()) {
        <div class="placeholder" aria-hidden="true"></div>
      } @else if (!auth.user()?.violations) {
        <p class="state">{{ x.noAccess }}</p>
      } @else {
        <app-violations />
      }
    </div>
  `,
  styleUrl: '../reminders/reminders-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViolationsPage {
  protected readonly i18n = inject(I18n);
  protected readonly auth = inject(Auth);
  protected readonly v = computed(() => VIOLATION_TEXTS[this.i18n.lang()]);

  protected readonly crumbs = computed(() => [
    { label: this.i18n.t().nav.home, link: this.i18n.path('home') },
    { label: this.v().title, link: this.i18n.path('violations') },
  ]);

  constructor() {
    const seo = inject(Seo);
    effect(() => seo.set({ ...this.i18n.t().seo.violations, noindex: true }));
    inject(DestroyRef).onDestroy(() => seo.set(null));
  }
}

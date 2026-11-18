import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { Auth } from '../../core/auth';
import { I18n } from '../../core/i18n/i18n';
import { Seo } from '../../core/seo';
import { PageHeader } from '../../shared/page-header';
import { VIOLATION_TEXTS } from './texts';
import { Violations } from './violations';
import { ViolationsBoard } from './violations-board';

/**
 * /priestupky – strikes for rule violations (Gether 18. 11. 2026). Two tabs: Prehľad for every approved player (the
 * description and who has a strike until when) and Správa (?tab=sprava) for the superadmin and the players with the
 * switch "Priestupky" on /hraci – the violations and the rules. A prerendered shell, not indexed, not in the sitemap;
 * the API refuses everyone else.
 */
@Component({
  selector: 'app-violations-page',
  imports: [PageHeader, Violations, ViolationsBoard],
  template: `
    @let x = v();
    <app-page-header [crumbs]="crumbs()" [eyebrow]="x.eyebrow" [title]="x.title" [intro]="x.lead" />

    <div class="container content is-wide">
      @if (!auth.ready()) {
        <div class="placeholder" aria-hidden="true"></div>
      } @else if (!member()) {
        <p class="state">{{ x.noAccess }}</p>
      } @else {
        @if (manager()) {
          <div class="segmented tabs" role="group" [attr.aria-label]="x.title">
            <button type="button" [attr.aria-pressed]="!managing()" (click)="showTab(null)">{{ x.tabs.board }}</button>
            <button type="button" [attr.aria-pressed]="managing()" (click)="showTab('sprava')">{{ x.tabs.manage }}</button>
          </div>
        }
        @if (managing()) {
          <app-violations />
        } @else {
          <app-violations-board />
        }
      }
    </div>
  `,
  styleUrl: '../reminders/reminders-page.scss',
  styles: `
    .tabs {
      margin-bottom: 18px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViolationsPage {
  protected readonly i18n = inject(I18n);
  protected readonly auth = inject(Auth);
  private readonly router = inject(Router);
  protected readonly v = computed(() => VIOLATION_TEXTS[this.i18n.lang()]);
  /** ?tab=sprava – the violations and the rules */
  readonly tab = input<string>();

  /** the board: every approved player and the superadmin */
  protected readonly member = computed(() => {
    const user = this.auth.user();
    return !!user && (!!user.approved || user.is_superuser);
  });
  protected readonly manager = computed(() => !!this.auth.user()?.violations);
  protected readonly managing = computed(() => this.tab() === 'sprava' && this.manager());

  protected readonly crumbs = computed(() => [
    { label: this.i18n.t().nav.home, link: this.i18n.path('home') },
    { label: this.v().title, link: this.i18n.path('violations') },
  ]);

  constructor() {
    const seo = inject(Seo);
    effect(() => seo.set({ ...this.i18n.t().seo.violations, noindex: true }));
    inject(DestroyRef).onDestroy(() => seo.set(null));
  }

  protected showTab(tab: 'sprava' | null): void {
    void this.router.navigate([], { queryParams: { tab }, queryParamsHandling: 'merge', replaceUrl: true });
  }
}

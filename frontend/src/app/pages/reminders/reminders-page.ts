import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Auth } from '../../core/auth';
import { I18n } from '../../core/i18n/i18n';
import { Seo } from '../../core/seo';
import { Icon } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';
import { Reminders } from './reminders';

/**
 * /pripomienky – the player's event reminders, sent as a Discord message by the bot (the bell in the header).
 * A prerendered shell: who is signed in is known only in the browser. Not indexed, not in the sitemap.
 */
@Component({
  selector: 'app-reminders-page',
  imports: [RouterLink, Icon, PageHeader, Reminders],
  template: `
    @let r = t().reminders;

    <app-page-header [crumbs]="crumbs()" [eyebrow]="r.eyebrow" [title]="r.title" [intro]="r.lead" />

    <div class="container content" [class.is-wide]="!!auth.user()">
      <div role="status">
        @if (notice(); as n) {
          <p class="notice" [class.notice--error]="n.error">{{ n.text }}</p>
        }
      </div>

      @if (!auth.ready()) {
        <div class="placeholder" aria-hidden="true"></div>
      } @else if (auth.failed()) {
        <p class="state">{{ r.error }}</p>
      } @else if (!auth.enabled()) {
        <p class="state">{{ r.disabled }}</p>
      } @else if (auth.user()) {
        <app-reminders />
      } @else {
        <section class="login" aria-labelledby="reminders-login">
          <span class="login__badge"><svg appIcon="bell"></svg></span>
          <h2 class="login__title" id="reminders-login">{{ r.loginTitle }}</h2>
          <p class="login__text">{{ r.loginText }}</p>
          <a class="btn btn--gold" [href]="auth.loginUrl()"
            ><svg appIcon="discord"></svg> {{ t().account.login }}</a
          >
          <a class="login__privacy" [routerLink]="i18n.path('privacy')">{{ t().account.privacy }}</a>
        </section>
      }
    </div>
  `,
  styleUrl: './reminders-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RemindersPage {
  /** ?login=error|cancelled – set by the backend after an unsuccessful Discord sign-in */
  readonly login = input<string>();

  protected readonly i18n = inject(I18n);
  protected readonly auth = inject(Auth);
  protected readonly t = this.i18n.t;

  protected readonly crumbs = computed(() => [
    { label: this.t().nav.home, link: this.i18n.path('home') },
    { label: this.t().reminders.title, link: this.i18n.path('reminders') },
  ]);

  protected readonly notice = computed(() => {
    const t = this.t().account;
    if (this.login() === 'error') return { text: t.loginError, error: true };
    if (this.login() === 'cancelled') return { text: t.loginCancelled, error: false };
    return null;
  });

  constructor() {
    const seo = inject(Seo);
    effect(() => seo.set({ ...this.t().seo.reminders, noindex: true }));
    inject(DestroyRef).onDestroy(() => seo.set(null));
  }
}

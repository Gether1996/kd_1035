import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Auth } from '../../core/auth';
import { I18n } from '../../core/i18n/i18n';
import { KvkApi } from '../../core/kvk-api';
import { Seo } from '../../core/seo';
import { Icon } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';
import { KvkForm } from './kvk-form';
import { KvkSettings } from './kvk-settings';
import { KvkSignups } from './kvk-signups';

type Tab = 'mine' | 'list' | 'settings';

/**
 * /kvk – KvK sign-ups for rally and garrison (Gether 11. 10. 2026). A player signs up with screenshots; the reviewers
 * he picks (R4) and the superuser see every sign-up; the superuser manages rounds and reviewers. A prerendered shell,
 * not indexed, not in the sitemap.
 */
@Component({
  selector: 'app-kvk-page',
  imports: [RouterLink, Icon, PageHeader, KvkForm, KvkSignups, KvkSettings],
  template: `
    @let k = t().kvk;

    <app-page-header [crumbs]="crumbs()" [eyebrow]="k.eyebrow" [title]="k.title" [intro]="k.intro" />

    <div class="container content is-wide">
      <div role="status">
        @if (notice(); as n) {
          <p class="notice" [class.notice--error]="n.error">{{ n.text }}</p>
        }
      </div>

      @if (!auth.ready()) {
        <div class="placeholder" aria-hidden="true"></div>
      } @else if (auth.failed()) {
        <p class="state">{{ k.loadError }}</p>
      } @else if (!auth.enabled()) {
        <p class="state">{{ t().reminders.disabled }}</p>
      } @else if (!auth.user()) {
        <section class="login" aria-labelledby="kvk-login">
          <span class="login__badge"><svg appIcon="swords"></svg></span>
          <h2 class="login__title" id="kvk-login">{{ k.loginTitle }}</h2>
          <p class="login__text">{{ k.loginText }}</p>
          <a class="btn btn--gold" [href]="auth.loginUrl()"><svg appIcon="discord"></svg> {{ t().account.login }}</a>
          <a class="login__privacy" [routerLink]="i18n.path('privacy')">{{ t().account.privacy }}</a>
        </section>
      } @else if (state.error()) {
        <p class="state">{{ k.loadError }}</p>
      } @else if (state.hasValue()) {
        @let s = state.value();
        @if (s.reviewer || s.superuser) {
          <div class="segmented kvk-tabs" role="group" [attr.aria-label]="k.title">
            @if (s.player) {
              <button type="button" [attr.aria-pressed]="tab() === 'mine'" (click)="tab.set('mine')">{{ k.tabs.mine }}</button>
            }
            <button type="button" [attr.aria-pressed]="tab() === 'list' || (!s.player && tab() === 'mine')" (click)="tab.set('list')">
              {{ k.tabs.list }}
            </button>
            @if (s.superuser) {
              <button type="button" [attr.aria-pressed]="tab() === 'settings'" (click)="tab.set('settings')">{{ k.tabs.settings }}</button>
            }
          </div>
        }
        @switch (s.player || tab() !== 'mine' ? tab() : 'list') {
          @case ('mine') {
            <app-kvk-form [state]="s" (changed)="reload()" />
          }
          @case ('list') {
            @if (rounds.hasValue()) {
              <app-kvk-signups [rounds]="rounds.value().rounds" />
            }
          }
          @case ('settings') {
            @if (rounds.hasValue()) {
              <app-kvk-settings [rounds]="rounds.value().rounds" (changed)="reload()" />
            }
          }
        }
      } @else {
        <div class="placeholder" aria-hidden="true"></div>
      }
    </div>
  `,
  styleUrls: ['../reminders/reminders-page.scss', './kvk.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KvkPage {
  /** ?login=error|cancelled – set by the backend after an unsuccessful Discord sign-in */
  readonly login = input<string>();

  protected readonly i18n = inject(I18n);
  protected readonly auth = inject(Auth);
  private readonly api = inject(KvkApi);
  protected readonly t = this.i18n.t;

  private readonly version = signal(0);
  protected readonly state = this.api.state(() => (this.auth.user() ? this.version() : -1));
  private readonly canReview = computed(() => {
    const s = this.state.hasValue() ? this.state.value() : null;
    return !!s && (s.reviewer || s.superuser);
  });
  protected readonly rounds = this.api.rounds(() => this.canReview(), () => this.version());
  protected readonly tab = signal<Tab>('mine');

  protected readonly crumbs = computed(() => [
    { label: this.t().nav.home, link: this.i18n.path('home') },
    { label: this.t().kvk.title, link: this.i18n.path('kvk') },
  ]);

  protected readonly notice = computed(() => {
    const t = this.t().account;
    if (this.login() === 'error') return { text: t.loginError, error: true };
    if (this.login() === 'cancelled') return { text: t.loginCancelled, error: false };
    return null;
  });

  constructor() {
    const seo = inject(Seo);
    effect(() => seo.set({ ...this.t().seo.kvk, noindex: true }));
    inject(DestroyRef).onDestroy(() => seo.set(null));
  }

  protected reload(): void {
    this.version.update((v) => v + 1);
  }
}

import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, linkedSignal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Auth } from '../../core/auth';
import { I18n } from '../../core/i18n/i18n';
import { KvkApi } from '../../core/kvk-api';
import { Seo } from '../../core/seo';
import { Icon } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';
import { PendingApproval } from '../../shared/pending-approval';
import { reloadOnReturn } from '../../shared/reload-on-return';
import { KvkForm } from './kvk-form';
import { KvkSignups } from './kvk-signups';

type Tab = 'mine' | 'list';
/** ?tab= of each tab – the own sign-up has none */
const QUERY: Record<Tab, string | null> = { mine: null, list: 'prihlasky' };

/**
 * /kvk – KvK sign-ups for rally and garrison (Gether 11. 10. 2026). A player signs up with screenshots; the sign-ups
 * stay until withdrawn (no rounds, no heading – Gether 20. 10. 2026). The reviewers (R4) and the superuser see every
 * sign-up; the superuser withdraws sign-ups and picks the reviewers (Hráči on /hraci). A prerendered shell,
 * not indexed, not in the sitemap. The list is in the address (?tab=prihlasky, with ?online= and ?hrac=), so a reload
 * or a link from "Top 5 equip" shows the same.
 */
@Component({
  selector: 'app-kvk-page',
  imports: [RouterLink, Icon, PageHeader, KvkForm, KvkSignups, PendingApproval],
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
@if (auth.discordLogin()) {
            <a class="btn btn--gold" [href]="auth.loginUrl()"><svg appIcon="discord"></svg> {{ t().account.login }}</a>
          }
          <!-- the in-game name and a password on /ucet, then back here -->
          @let other = auth.accountLink();
          <a class="login__other" [routerLink]="other.path" [queryParams]="other.query">{{ t().account.local.other }}</a>
          <a class="login__privacy" [routerLink]="i18n.path('privacy')">{{ t().account.privacy }}</a>
        </section>
      } @else if (state.error()) {
        <p class="state">{{ k.loadError }}</p>
      } @else if (state.hasValue()) {
        @let s = state.value();
        @if (s.reviewer || s.superuser) {
          <div class="segmented kvk-tabs" role="group" [attr.aria-label]="k.title">
            @if (s.player) {
              <button type="button" [attr.aria-pressed]="tab() === 'mine'" (click)="showTab('mine')">{{ k.tabs.mine }}</button>
            }
            <button type="button" [attr.aria-pressed]="tab() === 'list' || (!s.player && tab() === 'mine')" (click)="showTab('list')">
              {{ k.tabs.list }}
            </button>
          </div>
        }
        <!-- only the reviewers have the list – a player with ?tab=prihlasky gets the own sign-up -->
        @switch (!(s.reviewer || s.superuser) ? 'mine' : s.player || tab() !== 'mine' ? tab() : 'list') {
          @case ('mine') {
            @if (s.approved) {
              <app-kvk-form [state]="s" (changed)="reloadSignups()" />
            } @else {
              <!-- a new player waits for the superadmin (Gether 12. 10. 2026) -->
              <app-pending-approval />
            }
          }
          @case ('list') {
            <app-kvk-signups
              [data]="signups"
              [superuser]="s.superuser"
              [online]="online()"
              [focus]="focus()"
              [scrollToFocus]="!back"
              [canEvaluate]="auth.canEvaluate()"
              (changed)="reloadSignups()"
            />
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
  /** ?tab=prihlasky – the reviewers' list (no query = the own sign-up) */
  readonly tabQuery = input<string>(undefined, { alias: 'tab' });
  /** ?online=evenings – the list's filter by the survey's times (read by the list) */
  readonly online = input<string>();
  /** ?hrac=12 – that player's card in the list opens and is scrolled to (the link from "Top 5 equip") */
  readonly hrac = input<string>();

  protected readonly i18n = inject(I18n);
  protected readonly auth = inject(Auth);
  private readonly api = inject(KvkApi);
  protected readonly t = this.i18n.t;
  private readonly router = inject(Router);
  /** back/forward: App puts the page where the visitor left it, the list does not scroll to ?hrac= */
  protected readonly back = this.router.currentNavigation()?.trigger === 'popstate';

  // a boolean: a new user object (the in-game name saved) must not ask again
  private readonly signedIn = computed(() => !!this.auth.user());
  protected readonly state = this.api.state(() => this.signedIn());
  private readonly canReview = computed(() => {
    const s = this.state.hasValue() ? this.state.value() : null;
    return !!s && (s.reviewer || s.superuser);
  });
  protected readonly signups = this.api.signups(() => this.canReview());
  /** the tab of the address; a click sets it at once and writes the address after it */
  protected readonly tab = linkedSignal<Tab>(() => (this.tabQuery() === QUERY.list ? 'list' : 'mine'));
  protected readonly focus = computed(() => {
    const id = Number(this.hrac());
    return Number.isInteger(id) && id > 0 ? id : null;
  });

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
    // other players change their marches and sign-ups: the list asks again when the visitor comes back to the tab
    reloadOnReturn(() => {
      // also after a failed load (a phone back before its network) – the next return tries again
      if (this.canReview() && !this.signups.isLoading()) this.signups.reload();
    });
    const seo = inject(Seo);
    effect(() => seo.set({ ...this.t().seo.kvk, noindex: true }));
    inject(DestroyRef).onDestroy(() => seo.set(null));
  }

  /** the tab in the address without a new history entry – back leaves the page, not the tab; ?online= and ?hrac= stay */
  protected showTab(tab: Tab): void {
    this.tab.set(tab);
    void this.router.navigate([], { queryParams: { tab: QUERY[tab] }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  /** a sign-up changed: the reviewers' list asks again (the form keeps its own state) */
  protected reloadSignups(): void {
    if (this.canReview()) this.signups.reload();
  }
}

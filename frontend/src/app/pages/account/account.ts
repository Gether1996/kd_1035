import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { Auth } from '../../core/auth';
import { I18n, Lang } from '../../core/i18n/i18n';
import { marchHasProblem } from '../../core/kvk-api';
import { MarchesApi } from '../../core/marches-api';
import { Seo } from '../../core/seo';
import { Icon } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';
import { powerMillions } from '../../shared/power';
import { LocalLogin, PasswordForm } from './local-login';
import { PlayersAdmin } from './players-admin';

/**
 * /ucet – the player's own account: sign in with Discord or without it (local-login.ts), in-game name, current power,
 * the password without Discord, sign out, delete; a link to the event reminders (/pripomienky).
 * Not indexed, not in the sitemap.
 */
@Component({
  selector: 'app-account',
  imports: [RouterLink, Icon, PageHeader, PlayersAdmin, LocalLogin, PasswordForm],
  templateUrl: './account.html',
  styleUrl: './account.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Account {
  /** ?login=error|cancelled – set by the backend after an unsuccessful Discord sign-in */
  readonly login = input<string>();
  /** ?next= – after the first sign-in the player sets the in-game name here, then goes on to where they were going */
  readonly next = input<string>();

  protected readonly i18n = inject(I18n);
  protected readonly auth = inject(Auth);
  protected readonly t = this.i18n.t;

  /**
   * "Moje marche 2 na opravu" – the own marches (browser only, once the player is known); a pair or a formation the KvK
   * evaluation does not like. Nothing when the request fails.
   */
  private readonly ownMarches = inject(MarchesApi).list(() => !!this.auth.user()?.approved);
  protected readonly marchIssues = computed(() =>
    this.ownMarches.hasValue() ? this.ownMarches.value().marches.filter(marchHasProblem).length : 0,
  );

  /** first click on "delete" asks, the second one deletes */
  protected readonly confirming = signal(false);
  protected readonly busy = signal(false);
  protected readonly result = signal<'deleted' | 'failed' | null>(null);
  protected readonly saving = signal(false);
  protected readonly nameState = signal<'saved' | 'failed' | 'required' | 'taken' | null>(null);
  protected readonly powerState = signal<'saved' | 'failed' | 'invalid' | null>(null);
  protected readonly langState = signal<'saved' | 'failed' | null>(null);
  /** the names of the languages in their own language, like the switch in the header */
  protected readonly langs: { lang: Lang; label: string }[] = [
    { lang: 'sk', label: 'Slovenčina' },
    { lang: 'cs', label: 'Čeština' },
  ];

  protected readonly crumbs = computed(() => [
    { label: this.t().nav.home, link: this.i18n.path('home') },
    { label: this.t().account.title, link: this.i18n.path('account') },
  ]);

  protected readonly notice = computed(() => {
    const t = this.t().account;
    const result = this.result();
    if (result) return { text: result === 'deleted' ? t.deleted : t.actionError, error: result === 'failed' };
    const login = this.login();
    if (login === 'error') return { text: t.loginError, error: true };
    if (login === 'cancelled') return { text: t.loginCancelled, error: false };
    // the account without Discord linked to Discord, or that Discord account has its own account already
    if (login === 'linked') return { text: t.local.linked, error: false };
    if (login === 'taken') return { text: t.local.linkTaken, error: true };
    return null;
  });

  constructor() {
    // no in-game name yet: the field gets the focus once, so the player can type right away
    const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
    effect(() => {
      const input = this.nameInput()?.nativeElement;
      if (!isBrowser || this.asked || !input || !this.auth.needsName()) return;
      this.asked = true;
      input.focus();
    });
    const seo = inject(Seo);
    effect(() => seo.set({ ...this.t().seo.account, noindex: true }));
    inject(DestroyRef).onDestroy(() => seo.set(null));
  }

  /** the page the player was going to before the name was asked for – a path on this site only */
  protected readonly nextPage = computed(() => {
    const next = this.next() ?? '';
    return next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : null;
  });
  private readonly router = inject(Router);
  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');
  private asked = false;

  protected async saveName(event: Event, input: HTMLInputElement): Promise<void> {
    event.preventDefault();
    this.saving.set(true);
    this.nameState.set(null);
    try {
      // the field shows what was saved, also when only spaces around the name changed
      input.value = input.value.trim();
      // required (Gether 11. 10. 2026): it can be changed, not cleared – the server refuses an empty one too
      if (!input.value) {
        input.value = this.auth.user()?.ingame_name ?? '';
        this.nameState.set('required');
        input.focus();
        return;
      }
      await this.auth.saveIngameName(input.value);
      this.nameState.set('saved');
      // the first sign-in goes on to the page the player came for
      const next = this.nextPage();
      if (next && !this.auth.needsName()) void this.router.navigateByUrl(next);
    } catch (error) {
      // a player without Discord signs in with the name – another player's name is refused
      const taken = error instanceof HttpErrorResponse && `${error.error?.ingame_name ?? ''}`.includes('name_taken');
      this.nameState.set(taken ? 'taken' : 'failed');
    } finally {
      this.saving.set(false);
    }
  }

  /** signed in without Discord: on to the page the player came for */
  protected signedIn(): void {
    const next = this.nextPage();
    if (next) void this.router.navigateByUrl(next);
  }

  /** the power as the field shows it: millions with a decimal comma, no thousands separator */
  protected powerText(power: number | null): string {
    return power === null ? '' : new Intl.NumberFormat(this.i18n.locale(), { maximumFractionDigits: 1, useGrouping: false }).format(power);
  }

  /** the power of the KvK evaluation (Gether 14. 10. 2026) – millions or the whole number from the game; empty clears it */
  protected async savePower(event: Event, input: HTMLInputElement): Promise<void> {
    event.preventDefault();
    this.powerState.set(null);
    const power = powerMillions(input.value);
    if (power === undefined) {
      this.powerState.set('invalid');
      input.focus();
      return;
    }
    this.saving.set(true);
    try {
      await this.auth.savePower(power);
      input.value = this.powerText(power);
      this.powerState.set('saved');
    } catch {
      this.powerState.set('failed');
    } finally {
      this.saving.set(false);
    }
  }

  /** SK/CZ for the website and the bot's messages; the page goes on in the language picked */
  protected async saveLang(lang: Lang): Promise<void> {
    this.langState.set(null);
    this.saving.set(true);
    try {
      await this.auth.saveLang(lang);
      this.langState.set('saved');
      if (lang !== this.i18n.lang()) {
        void this.router.navigateByUrl(this.i18n.path('account', lang) + location.hash, { replaceUrl: true });
      }
    } catch {
      this.langState.set('failed');
    } finally {
      this.saving.set(false);
    }
  }

  protected logout(): Promise<void> {
    return this.run(() => this.auth.logout(), null);
  }

  protected remove(): Promise<void> | void {
    if (!this.confirming()) {
      this.confirming.set(true);
      return;
    }
    return this.run(() => this.auth.deleteAccount(), 'deleted');
  }

  private async run(action: () => Promise<void>, done: 'deleted' | null): Promise<void> {
    this.busy.set(true);
    this.result.set(null);
    try {
      await action();
      this.result.set(done);
      this.confirming.set(false);
    } catch {
      this.result.set('failed');
    } finally {
      this.busy.set(false);
    }
  }
}

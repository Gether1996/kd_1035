import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpErrorResponse, httpResource } from '@angular/common/http';
import { Injectable, PLATFORM_ID, computed, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { I18n } from './i18n/i18n';

export interface Player {
  /** null for a player without Discord */
  discord_id: string | null;
  /** signed up without Discord – the in-game name and a password (Gether 17. 10. 2026): no bot DMs */
  local?: boolean;
  name: string;
  avatar_url: string;
  /** typed by the player on /ucet, '' until then */
  ingame_name: string;
  /** the current power in millions – the one of the KvK evaluation, typed on /ucet or by the superadmin; null = none */
  power?: number | null;
  /** adds marches and KvK sign-ups – a new player waits for the superadmin (Gether 12. 10. 2026) */
  approved: boolean;
  /** agreed to the current terms of use – else the terms gate asks first */
  terms_accepted: boolean;
  is_staff: boolean;
  /** manages events (the admin, and in the calendar) */
  is_superuser: boolean;
  /** /vyhodnocovanie: the superadmin, and the players the superadmin lets in (Gether 13. and 14. 10. 2026) – the
   * estimate with the variables, or only the published required acclaim (true with the first one too) */
  evaluation_settings?: boolean;
  evaluation_overview?: boolean;
}

export interface Me {
  /** signing in is on – without Discord always */
  login_enabled: boolean;
  /** false until DISCORD_CLIENT_ID/SECRET are set on the server */
  discord_login?: boolean;
  /** the sign-up without Discord takes new players (at most 10 wait for the approval at once) */
  signup_open?: boolean;
  user: Player | null;
}

/** Why the server refused the sign-up, the sign-in or the password: `detail`, and the password rules broken. */
export interface LocalAuthError {
  detail: string;
  errors?: string[];
}

/**
 * Player signed in with Discord (Django session). Only asked in the browser – prerendered pages render
 * neither the login button nor the player, so nothing jumps when the answer arrives.
 * The request also sets the csrftoken cookie that HttpClient sends back as X-CSRFToken.
 */
@Injectable({ providedIn: 'root' })
export class Auth {
  private readonly http = inject(HttpClient);
  private readonly i18n = inject(I18n);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly me = httpResource<Me>(() => (this.isBrowser ? '/api/auth/me/' : undefined));

  /** false while loading and during prerendering */
  readonly ready = computed(() => this.me.hasValue() || !!this.me.error());
  readonly failed = computed(() => !!this.me.error());
  readonly enabled = computed(() => this.me.hasValue() && this.me.value().login_enabled);
  readonly user = computed(() => (this.me.hasValue() ? this.me.value().user : null));
  readonly discordLogin = computed(() => this.me.hasValue() && !!this.me.value().discord_login);
  readonly signupOpen = computed(() => this.me.hasValue() && this.me.value().signup_open !== false);
  /** signed in without an in-game name yet – the header shows a red "!" and the account page asks for it
   * (Gether 11. 10. 2026: required at the first sign-in, a reminder until it is set) */
  readonly needsName = computed(() => {
    const user = this.user();
    return !!user && !user.ingame_name.trim();
  });
  /** signed in without the current power – the same reminder as the name (Gether 14. 10. 2026), the power is not
   * required, the reminder stays until it is written down */
  readonly needsPower = computed(() => {
    const user = this.user();
    return !!user && (user.power ?? null) === null;
  });
  /** the red "!" in the header: something of the profile is missing */
  readonly needsAttention = computed(() => this.needsName() || this.needsPower());
  /** opens /vyhodnocovanie – the account menu item and the links to it (/marche) show exactly then */
  readonly canEvaluate = computed(() => {
    const user = this.user();
    return !!user && (!!user.evaluation_settings || !!user.evaluation_overview || user.is_superuser);
  });

  /** Full navigation to Discord; afterwards the player comes back to `next` (the current page by default). */
  loginUrl(next = this.i18n.switchPath(this.i18n.lang())): string {
    return '/api/auth/discord/login/?next=' + encodeURIComponent(next);
  }

  /** The signed-in player without Discord links the account to Discord – the same account, then with the bot's DMs. */
  linkUrl(next = this.i18n.path('account')): string {
    return '/api/auth/discord/login/?link=1&next=' + encodeURIComponent(next);
  }

  /** The page with every way to sign in (/ucet), coming back to `next` – the header, KvK and marches link there. */
  accountLink(next = this.i18n.switchPath(this.i18n.lang())): { path: string; query: { next?: string } } {
    const path = this.i18n.path('account');
    return { path, query: next === path ? {} : { next } };
  }

  /** A new player without Discord (`elapsed` = ms the form was open, `website` = the field hidden from people). */
  signUp(form: { name: string; password: string; website: string; elapsed: number }): Promise<void> {
    return this.local('signup', { ...form, lang: this.i18n.lang() });
  }

  /** Signs in with the in-game name and the password. */
  signIn(name: string, password: string): Promise<void> {
    return this.local('login', { name, password });
  }

  /** A new password with the superadmin's one-off code; signs the player in. */
  resetPassword(name: string, code: string, password: string): Promise<void> {
    return this.local('reset', { name, code, password });
  }

  /** The signed-in player without Discord changes the password. */
  async changePassword(current: string, password: string): Promise<void> {
    try {
      await firstValueFrom(this.http.post('/api/auth/local/password/', { current, password }));
    } catch (error) {
      throw localError(error);
    }
  }

  private async local(action: string, body: object): Promise<void> {
    try {
      this.me.set(await firstValueFrom(this.http.post<Me>(`/api/auth/local/${action}/`, body)));
    } catch (error) {
      throw localError(error);
    }
  }

  /** ask the server again – e.g. the KvK sign-up saved the in-game name */
  reload(): void {
    this.me.reload();
  }

  async logout(): Promise<void> {
    await firstValueFrom(this.http.post('/api/auth/logout/', null));
    this.me.reload();
  }

  /** The player's name in Rise of Kingdoms, so leadership recognises them ('' clears it). */
  async saveIngameName(name: string): Promise<void> {
    this.me.set(await firstValueFrom(this.http.patch<Me>('/api/auth/me/', { ingame_name: name })));
  }

  /** The player's current power in millions (null clears it) – the KvK evaluation counts with it. */
  async savePower(power: number | null): Promise<void> {
    this.me.set(await firstValueFrom(this.http.patch<Me>('/api/auth/me/', { power })));
  }

  /** The player agrees to the current terms of use (the server saves the version and the time). */
  async acceptTerms(): Promise<void> {
    this.me.set(await firstValueFrom(this.http.post<Me>('/api/auth/terms/', null)));
  }

  /** Deletes the player's account on the website (their Discord account is not touched). */
  async deleteAccount(): Promise<void> {
    await firstValueFrom(this.http.delete('/api/auth/me/'));
    this.me.reload();
  }
}

/** The server's reason as LocalAuthError; a lost connection or a server error is `failed`, the limit `throttled`. */
export function localError(error: unknown): LocalAuthError {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 429) return { detail: 'throttled' };
    const body = error.error as Partial<LocalAuthError> | null;
    if (error.status < 500 && typeof body?.detail === 'string') return { detail: body.detail, errors: body.errors };
  }
  return { detail: 'failed' };
}

import { isPlatformBrowser } from '@angular/common';
import { HttpClient, httpResource } from '@angular/common/http';
import { Injectable, PLATFORM_ID, computed, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { I18n } from './i18n/i18n';

export interface Player {
  discord_id: string;
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
  /** /vyhodnocovanie: the superadmin, and the players the superadmin lets in (Gether 13. 10. 2026) */
  evaluator?: boolean;
}

export interface Me {
  /** false until DISCORD_CLIENT_ID/SECRET are set on the server */
  login_enabled: boolean;
  user: Player | null;
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
  /** signed in without an in-game name yet – the header shows a red "!" and the account page asks for it
   * (Gether 11. 10. 2026: required at the first sign-in, a reminder until it is set) */
  readonly needsName = computed(() => {
    const user = this.user();
    return !!user && !user.ingame_name.trim();
  });

  /** Full navigation to Discord; afterwards the player comes back to `next` (the current page by default). */
  loginUrl(next = this.i18n.switchPath(this.i18n.lang())): string {
    return '/api/auth/discord/login/?next=' + encodeURIComponent(next);
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

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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Auth, ProfileFields } from '../../core/auth';
import { I18n, Lang } from '../../core/i18n/i18n';
import { marchHasProblem } from '../../core/kvk-api';
import { MarchesApi } from '../../core/marches-api';
import { Seo } from '../../core/seo';
import { Icon } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';
import { parseGameNumber, shortGameNumber } from '../../shared/game-number';
import { powerMillions } from '../../shared/power';
import { LocalLogin, PasswordForm } from './local-login';

/**
 * /ucet – the player's own account: sign in with Discord or without it (local-login.ts), in-game name, current power,
 * the password without Discord, sign out, delete; a link to the event reminders (/pripomienky).
 * Not indexed, not in the sitemap.
 */
/** what the profile's save says: saved, or why not */
type ProfileState = 'saved' | 'failed' | 'required' | 'taken' | 'powerInvalid' | 'invalid';

@Component({
  selector: 'app-account',
  imports: [RouterLink, Icon, PageHeader, LocalLogin, PasswordForm],
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
  /** the profile's one save (Gether 12. 11. 2026): what happened to it, and whether a field differs from the account */
  protected readonly profileState = signal<ProfileState | null>(null);
  protected readonly changed = signal(false);
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
    // the Hráči list was /ucet#hraci until 20. 10. 2026 (older Discord messages link there): on to its own page
    const fragment = inject(ActivatedRoute).snapshot.fragment;
    effect(() => {
      if (fragment === 'hraci' && this.auth.user()?.is_superuser) {
        void this.router.navigateByUrl(this.i18n.path('players'), { replaceUrl: true });
      }
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
  /** "8.8B" – the field shows a number as the game does; '' = not written down */
  protected short(n: number | null | undefined): string {
    return n == null ? '' : shortGameNumber(n);
  }

  /** what each field shows for the account as saved – a field that differs lights up the save */
  private shown(): string[] {
    const user = this.auth.user();
    return [
      user?.ingame_name ?? '',
      this.powerText(user?.power ?? null),
      user?.vip == null ? '' : String(user.vip),
      this.short(user?.kill_points),
      this.short(user?.highest_acclaim),
    ];
  }

  protected checkChanges(...inputs: HTMLInputElement[]): void {
    const shown = this.shown();
    this.changed.set(inputs.some((input, i) => input.value.trim() !== shown[i]));
    // typing again clears the last message, like every field did before
    this.profileState.set(null);
  }

  protected profileText(state: ProfileState): string {
    const a = this.t().account;
    if (state === 'powerInvalid') return a.power.invalid;
    if (state === 'invalid') return a.stats.invalid;
    return a.ingame[state];
  }

  /**
   * The profile in one save (Gether 12. 11. 2026): the in-game name (required – it can be changed, not cleared), the
   * power for the KvK evaluation – millions (101,5) or the whole number from the game – and the VIP level, kill points
   * and the highest acclaim of the account overview (VIP 0–25, the numbers as the game shows them, "8.8B"). Only the
   * fields that changed are sent, so an untouched power writes nothing into the evaluation's history; an emptied
   * number clears it.
   */
  protected async saveProfile(
    event: Event,
    name: HTMLInputElement,
    power: HTMLInputElement,
    vip: HTMLInputElement,
    kp: HTMLInputElement,
    acclaim: HTMLInputElement,
  ): Promise<void> {
    event.preventDefault();
    this.profileState.set(null);
    // the field shows what was saved, also when only spaces around the name changed
    name.value = name.value.trim();
    if (!name.value) {
      name.value = this.auth.user()?.ingame_name ?? '';
      this.profileState.set('required');
      name.focus();
      return;
    }
    const millions = powerMillions(power.value);
    if (millions === undefined) {
      this.profileState.set('powerInvalid');
      power.focus();
      return;
    }
    const level = vip.value.trim() ? Number(vip.value.trim()) : null;
    const killPoints = parseGameNumber(kp.value);
    const highest = parseGameNumber(acclaim.value);
    const vipOk = level === null || (Number.isInteger(level) && level >= 0 && level <= 25);
    if (!vipOk || killPoints === undefined || highest === undefined) {
      this.profileState.set('invalid');
      (!vipOk ? vip : killPoints === undefined ? kp : acclaim).focus();
      return;
    }
    const shown = this.shown();
    const fields: ProfileFields = {};
    if (name.value !== shown[0]) fields.ingame_name = name.value;
    if (power.value.trim() !== shown[1]) fields.power = millions;
    if (vip.value.trim() !== shown[2]) fields.vip = level;
    if (kp.value.trim() !== shown[3]) fields.kill_points = killPoints;
    if (acclaim.value.trim() !== shown[4]) fields.highest_acclaim = highest;
    if (!Object.keys(fields).length) {
      this.changed.set(false);
      return;
    }
    this.saving.set(true);
    try {
      await this.auth.saveProfile(fields);
      // as the game shows them
      power.value = this.powerText(millions);
      kp.value = this.short(killPoints);
      acclaim.value = this.short(highest);
      this.changed.set(false);
      this.profileState.set('saved');
      // the first sign-in goes on to the page the player came for
      const next = this.nextPage();
      if ('ingame_name' in fields && next && !this.auth.needsName()) void this.router.navigateByUrl(next);
    } catch (error) {
      // a player without Discord signs in with the name – another player's name is refused
      const taken = error instanceof HttpErrorResponse && `${error.error?.ingame_name ?? ''}`.includes('name_taken');
      this.profileState.set(taken ? 'taken' : 'failed');
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

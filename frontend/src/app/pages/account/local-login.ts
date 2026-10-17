import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { Auth, LocalAuthError } from '../../core/auth';
import { I18n } from '../../core/i18n/i18n';
import { Icon } from '../../shared/icon';

type Mode = 'login' | 'signup' | 'reset';

/** The server's refusal in words: the broken password rules one after another, else the reason of the mode. */
export function localMessage(t: ReturnType<I18n['t']>['account']['local'], error: LocalAuthError, mode: Mode | 'change'): string {
  if (error.detail === 'password') {
    const rules = t.rules as Record<string, string>;
    return (error.errors ?? []).map((code) => rules[code] ?? t.rules.invalid).join(' ') || t.rules.invalid;
  }
  if (error.detail === 'invalid') return t.invalid[mode === 'change' ? 'login' : mode];
  const reasons = t.errors as Record<string, string>;
  return reasons[error.detail] ?? t.errors.failed;
}

/**
 * /ucet signed out: signing in without Discord (Gether 17. 10. 2026) – the in-game name and a password, a new account,
 * a new password with the superadmin's one-off code. The field `website` is hidden from people (bots fill it in) and the
 * server also wants the form open a few seconds; at most 10 new players wait for the approval at once.
 */
@Component({
  selector: 'app-local-login',
  imports: [Icon],
  template: `
    @let l = t();
    <div class="local">
      <p class="local__or"><span>{{ l.or }}</span></p>
      <div class="segmented local__modes" role="group" [attr.aria-label]="l.modes">
        <button type="button" [attr.aria-pressed]="mode() !== 'signup'" (click)="switchTo('login')">{{ l.login }}</button>
        <button type="button" [attr.aria-pressed]="mode() === 'signup'" (click)="switchTo('signup')">{{ l.signup }}</button>
      </div>

      @if (mode() === 'signup' && !auth.signupOpen()) {
        <p class="local__state is-error" role="status">{{ l.errors.full }}</p>
      } @else {
        <form class="local__form" novalidate (submit)="submit($event, name, password, trap, code)">
          @if (mode() === 'reset') {
            <p class="local__lead">{{ l.resetLead }}</p>
          }
          <div class="field">
            <label class="field__label" for="local-name">{{ l.name }}</label>
            <input
              #name
              id="local-name"
              class="input"
              type="text"
              maxlength="32"
              autocomplete="username"
              autocapitalize="off"
              spellcheck="false"
              [attr.aria-describedby]="mode() === 'signup' ? 'local-name-hint' : null"
              (input)="message.set(null)"
            />
            @if (mode() === 'signup') {
              <p class="field__hint" id="local-name-hint">{{ l.nameHint }}</p>
            }
          </div>
          <div class="field" [hidden]="mode() !== 'reset'">
            <label class="field__label" for="local-code">{{ l.code }}</label>
            <input
              #code
              id="local-code"
              class="input local__code"
              type="text"
              maxlength="12"
              autocomplete="one-time-code"
              autocapitalize="characters"
              spellcheck="false"
              placeholder="ABCD-EFGH"
              (input)="message.set(null)"
            />
          </div>
          <div class="field">
            <label class="field__label" for="local-password">{{ mode() === 'login' ? l.password : l.newPassword }}</label>
            <div class="local__secret">
              <input
                #password
                id="local-password"
                class="input"
                maxlength="128"
                [type]="shown() ? 'text' : 'password'"
                [attr.autocomplete]="mode() === 'login' ? 'current-password' : 'new-password'"
                [attr.aria-describedby]="mode() === 'login' ? null : 'local-password-hint'"
                (input)="message.set(null)"
              />
              <button
                type="button"
                class="local__eye"
                [attr.aria-label]="l.show"
                [attr.aria-pressed]="shown()"
                (click)="shown.set(!shown())"
              >
                <svg [appIcon]="shown() ? 'eye-off' : 'eye'"></svg>
              </button>
            </div>
            @if (mode() !== 'login') {
              <p class="field__hint" id="local-password-hint">{{ l.passwordHint }}</p>
            }
          </div>
          <!-- hidden from people: bots fill in every field -->
          <div class="local__trap" aria-hidden="true">
            <label for="local-website">Website</label>
            <input #trap id="local-website" type="text" name="website" tabindex="-1" autocomplete="off" />
          </div>
          @if (mode() === 'signup') {
            <p class="local__note">{{ l.signupNote }}</p>
          }
          <!-- Discord stays the main way: the second button is quieter next to it -->
          <button type="submit" class="btn" [class.btn--gold]="!auth.discordLogin()" [class.btn--ghost]="auth.discordLogin()" [disabled]="busy()">
            <svg [appIcon]="mode() === 'reset' ? 'key-round' : 'log-in'"></svg> {{ l.submit[mode()] }}
          </button>
          <p class="local__state is-error" role="status">{{ message() }}</p>
        </form>
      }
      @if (mode() === 'reset') {
        <button type="button" class="local__link" (click)="switchTo('login')">{{ l.back }}</button>
      } @else if (mode() === 'login') {
        <button type="button" class="local__link" (click)="switchTo('reset')">{{ l.forgot }}</button>
      }
    </div>
  `,
  styleUrl: './local-login.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LocalLogin {
  protected readonly auth = inject(Auth);
  private readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.t().account.local);

  /** signed in – the account page goes on to ?next= */
  readonly done = output<void>();

  protected readonly mode = signal<Mode>('login');
  protected readonly busy = signal(false);
  protected readonly shown = signal(false);
  protected readonly message = signal<string | null>(null);
  /** the server refuses a sign-up posted a moment after the form appeared */
  private opened = Date.now();

  protected switchTo(mode: Mode): void {
    this.mode.set(mode);
    this.message.set(null);
  }

  protected async submit(
    event: Event,
    name: HTMLInputElement,
    password: HTMLInputElement,
    trap: HTMLInputElement,
    code: HTMLInputElement,
  ): Promise<void> {
    event.preventDefault();
    const mode = this.mode();
    const t = this.t();
    const missing = !name.value.trim() ? name : !code.value.trim() && mode === 'reset' ? code : !password.value ? password : null;
    if (missing) {
      this.message.set(t.errors.required);
      missing.focus();
      return;
    }
    this.busy.set(true);
    this.message.set(null);
    try {
      if (mode === 'signup') {
        await this.auth.signUp({
          name: name.value,
          password: password.value,
          website: trap.value,
          elapsed: Date.now() - this.opened,
        });
      } else if (mode === 'reset') {
        await this.auth.resetPassword(name.value, code.value, password.value);
      } else {
        await this.auth.signIn(name.value, password.value);
      }
      this.done.emit();
    } catch (error) {
      const refused = error as LocalAuthError;
      this.message.set(localMessage(t, refused, mode));
      if (refused.detail === 'password') password.focus();
      else if (refused.detail === 'name' || refused.detail === 'name_taken') name.focus();
      if (refused.detail === 'full') this.auth.reload();
    } finally {
      this.busy.set(false);
    }
  }
}

/**
 * /ucet signed in without Discord: a new password (the current one first). Other devices stay signed in until their
 * next request – Django ends their sessions.
 */
@Component({
  selector: 'app-password-form',
  template: `
    @let l = t();
    <details class="password">
      <summary class="password__toggle">{{ l.change }}</summary>
      <form class="password__form" novalidate (submit)="submit($event, current, next)">
        <div class="field">
          <label class="field__label" for="password-current">{{ l.current }}</label>
          <input #current id="password-current" class="input" type="password" maxlength="128" autocomplete="current-password" (input)="state.set(null)" />
        </div>
        <div class="field">
          <label class="field__label" for="password-new">{{ l.newPassword }}</label>
          <input
            #next
            id="password-new"
            class="input"
            type="password"
            maxlength="128"
            autocomplete="new-password"
            aria-describedby="password-new-hint"
            (input)="state.set(null)"
          />
          <p class="field__hint" id="password-new-hint">{{ l.passwordHint }}</p>
        </div>
        <button type="submit" class="btn btn--ghost" [disabled]="busy()">{{ l.save }}</button>
        <p class="local__state" role="status" [class.is-error]="state()?.error">{{ state()?.text }}</p>
      </form>
    </details>
  `,
  styleUrl: './local-login.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PasswordForm {
  private readonly auth = inject(Auth);
  private readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.t().account.local);
  protected readonly busy = signal(false);
  protected readonly state = signal<{ text: string; error: boolean } | null>(null);

  protected async submit(event: Event, current: HTMLInputElement, next: HTMLInputElement): Promise<void> {
    event.preventDefault();
    const t = this.t();
    if (!current.value || !next.value) {
      this.state.set({ text: t.errors.required, error: true });
      (current.value ? next : current).focus();
      return;
    }
    this.busy.set(true);
    this.state.set(null);
    try {
      await this.auth.changePassword(current.value, next.value);
      current.value = next.value = '';
      this.state.set({ text: t.changed, error: false });
    } catch (error) {
      const refused = error as LocalAuthError;
      this.state.set({ text: localMessage(t, refused, 'change'), error: true });
      (refused.detail === 'current' ? current : next).focus();
    } finally {
      this.busy.set(false);
    }
  }
}

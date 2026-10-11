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
import { Router, RouterLink } from '@angular/router';
import { Auth } from '../../core/auth';
import { I18n } from '../../core/i18n/i18n';
import { Seo } from '../../core/seo';
import { Icon } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';
import { PlayersAdmin } from './players-admin';

/**
 * /ucet – the player's own account: sign in with Discord, in-game name, sign out, delete; a link to the event
 * reminders (/pripomienky).
 * Not indexed, not in the sitemap.
 */
@Component({
  selector: 'app-account',
  imports: [RouterLink, Icon, PageHeader, PlayersAdmin],
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

  /** first click on "delete" asks, the second one deletes */
  protected readonly confirming = signal(false);
  protected readonly busy = signal(false);
  protected readonly result = signal<'deleted' | 'failed' | null>(null);
  protected readonly saving = signal(false);
  protected readonly nameState = signal<'saved' | 'failed' | 'required' | null>(null);

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
    } catch {
      this.nameState.set('failed');
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

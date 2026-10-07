import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { Auth } from '../../core/auth';
import { I18n } from '../../core/i18n/i18n';
import { Seo } from '../../core/seo';
import { Icon } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';

/** /ucet – the player's own account (sign in with Discord, sign out, delete). Not indexed, not in the sitemap. */
@Component({
  selector: 'app-account',
  imports: [Icon, PageHeader],
  templateUrl: './account.html',
  styleUrl: './account.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Account {
  /** ?login=error|cancelled – set by the backend after an unsuccessful Discord sign-in */
  readonly login = input<string>();

  protected readonly i18n = inject(I18n);
  protected readonly auth = inject(Auth);
  protected readonly t = this.i18n.t;

  /** first click on "delete" asks, the second one deletes */
  protected readonly confirming = signal(false);
  protected readonly busy = signal(false);
  protected readonly result = signal<'deleted' | 'failed' | null>(null);

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
    const seo = inject(Seo);
    effect(() => seo.set({ ...this.t().seo.account, noindex: true }));
    inject(DestroyRef).onDestroy(() => seo.set(null));
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

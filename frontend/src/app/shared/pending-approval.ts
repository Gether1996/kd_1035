import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, computed, inject } from '@angular/core';
import { Auth } from '../core/auth';
import { I18n } from '../core/i18n/i18n';
import { Icon } from './icon';
import { reloadOnReturn } from './reload-on-return';

/**
 * A new player the superadmin has not approved yet (Gether 12. 10. 2026) – instead of adding marches, the KvK sign-up
 * and the other players' marches. Asks who is signed in again when it shows and when the player comes back to the tab,
 * so the page opens up as soon as the superadmin approves them.
 */
@Component({
  selector: 'app-pending-approval',
  imports: [Icon],
  template: `
    @let p = t();
    <section class="pending" aria-labelledby="pending-title">
      <span class="pending__badge"><svg appIcon="clock"></svg></span>
      <h2 class="pending__title" id="pending-title">{{ p.title }}</h2>
      <p class="pending__text">{{ local() ? p.textLocal : p.text }}</p>
    </section>
  `,
  styles: `
    .pending {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: clamp(28px, 6vw, 44px) clamp(20px, 5vw, 40px);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: var(--card-bg);
      text-align: center;
    }

    .pending__badge {
      display: grid;
      place-items: center;
      width: 56px;
      height: 56px;
      border: 1px solid var(--line-strong);
      border-radius: 16px;
      background: color-mix(in srgb, var(--gold-400) 10%, transparent);
      color: var(--gold-300);

      .icon {
        width: 26px;
        height: 26px;
      }
    }

    .pending__title {
      margin-top: 18px;
      font-size: clamp(1.375rem, 1.15rem + 1vw, 1.75rem);
    }

    .pending__text {
      max-width: 46ch;
      margin-top: 12px;
      color: var(--text-dim);
      text-wrap: pretty;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PendingApproval {
  private readonly i18n = inject(I18n);
  private readonly auth = inject(Auth);
  protected readonly t = computed(() => this.i18n.t().marches.pending);
  /** without Discord no bot writes after the approval – the text does not promise it */
  protected readonly local = computed(() => !!this.auth.user()?.local);

  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) this.auth.reload();
    reloadOnReturn(() => this.auth.reload());
  }
}

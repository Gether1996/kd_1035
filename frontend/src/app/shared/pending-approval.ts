import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { I18n } from '../core/i18n/i18n';
import { Icon } from './icon';

/**
 * A new player the superadmin has not approved yet (Gether 12. 10. 2026) – instead of adding marches, the KvK sign-up
 * and the other players' marches. The superadmin already got a Discord message about them.
 */
@Component({
  selector: 'app-pending-approval',
  imports: [Icon],
  template: `
    @let p = t();
    <section class="pending" aria-labelledby="pending-title">
      <span class="pending__badge"><svg appIcon="clock"></svg></span>
      <h2 class="pending__title" id="pending-title">{{ p.title }}</h2>
      <p class="pending__text">{{ p.text }}</p>
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
  protected readonly t = computed(() => this.i18n.t().marches.pending);
}

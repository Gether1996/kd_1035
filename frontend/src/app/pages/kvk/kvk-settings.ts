import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n } from '../../core/i18n/i18n';
import { KvkApi, KvkHeading } from '../../core/kvk-api';
import { Icon } from '../../shared/icon';

/**
 * "Nastavenia" on /kvk – superuser only: the heading of the sign-ups, e.g. the date of the next KvK (Gether
 * 11. 10. 2026: no rounds, the sign-ups stay). Who sees every sign-up (R4) is picked under "Hráči" on /ucet – this tab
 * only links there.
 */
@Component({
  selector: 'app-kvk-settings',
  imports: [Icon, RouterLink],
  templateUrl: './kvk-settings.html',
  styleUrl: './kvk.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KvkSettings {
  readonly heading = input.required<KvkHeading>();
  /** the heading changed – the page asks again */
  readonly changed = output<void>();

  private readonly api = inject(KvkApi);
  protected readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.t().kvk);

  protected readonly titleSk = linkedSignal(() => this.heading().title_sk);
  protected readonly titleCs = linkedSignal(() => this.heading().title_cs);
  protected readonly busy = signal(false);
  protected readonly state = signal<'saved' | 'failed' | null>(null);

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy()) return;
    this.busy.set(true);
    this.state.set(null);
    try {
      await this.api.saveHeading({ title_sk: this.titleSk().trim(), title_cs: this.titleCs().trim() });
      this.state.set('saved');
      this.changed.emit();
    } catch {
      this.state.set('failed');
    } finally {
      this.busy.set(false);
    }
  }
}

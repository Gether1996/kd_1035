import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n } from '../../core/i18n/i18n';
import { KvkApi, KvkRound } from '../../core/kvk-api';
import { Icon } from '../../shared/icon';

/**
 * "Nastavenia" on /kvk – superuser only: open, close and delete sign-up rounds (one open at a time). Who sees every
 * sign-up (R4) is picked under "Hráči" on /ucet – this tab only links there.
 */
@Component({
  selector: 'app-kvk-settings',
  imports: [Icon, RouterLink],
  templateUrl: './kvk-settings.html',
  styleUrl: './kvk.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KvkSettings {
  readonly rounds = input.required<KvkRound[]>();
  /** rounds changed – the page asks again */
  readonly changed = output<void>();

  private readonly api = inject(KvkApi);
  protected readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.t().kvk);

  protected readonly titleSk = signal('');
  protected readonly titleCs = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal(false);
  /** the round whose delete waits for the second click */
  protected readonly armed = signal<number | null>(null);

  protected async create(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.titleSk().trim() || this.busy()) return;
    if (await this.run(() => this.api.createRound(this.titleSk().trim(), this.titleCs().trim()))) {
      this.titleSk.set('');
      this.titleCs.set('');
    }
  }

  protected async toggle(round: KvkRound): Promise<void> {
    await this.run(() => this.api.updateRound(round.id, { is_open: !round.is_open }));
  }

  protected async remove(round: KvkRound): Promise<void> {
    if (this.armed() !== round.id) {
      this.armed.set(round.id);
      return;
    }
    this.armed.set(null);
    await this.run(() => this.api.deleteRound(round.id));
  }

  protected title(round: KvkRound): string {
    return (this.i18n.lang() === 'cs' && round.title_cs) || round.title_sk;
  }

  protected count(n: number): string {
    const [one, few, many] = this.t().signupsCount;
    return (n === 1 ? one : n >= 2 && n <= 4 ? few : many).replace('{n}', String(n));
  }

  /** true when the action succeeded */
  private async run(action: () => Promise<unknown>): Promise<boolean> {
    this.busy.set(true);
    this.error.set(false);
    try {
      await action();
      this.changed.emit();
      return true;
    } catch {
      this.error.set(true);
      return false;
    } finally {
      this.busy.set(false);
    }
  }
}

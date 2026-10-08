import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { I18n } from '../../../core/i18n/i18n';
import { ReminderEvent, RemindersApi } from '../../../core/reminders-api';
import { Icon } from '../../../shared/icon';
import { reminderLabel, repeatLabel } from './format';
import { ReminderPicker } from './reminder-picker';

/**
 * One event in "Pripomienky eventov": a compact row (name, next start, the player's times) that opens the full
 * ReminderPicker only on demand, so the list stays short even with many events. Only one row is open at a time –
 * the parent decides (`open`, `toggled`).
 */
@Component({
  selector: 'li[appEventRow]',
  imports: [Icon, ReminderPicker],
  templateUrl: './event-row.html',
  styleUrl: './event-row.scss',
  host: { class: 'event', '[class.is-on]': 'on()', '[class.is-open]': 'open()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventRow {
  readonly event = input.required<ReminderEvent>();
  /** the times are shown */
  readonly open = input(false);
  readonly toggled = output<void>();
  /** the player's times after a change (null = not reminded), so the parent keeps its overview current */
  readonly changed = output<number[] | null>();

  private readonly api = inject(RemindersApi);
  private readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.t().reminders);

  /** the player's times, largest first; [] = not reminded */
  protected readonly offsets = linkedSignal(() => this.event().offsets ?? []);
  protected readonly on = computed(() => this.offsets().length > 0);
  /** the event as the picker needs it, with the times changed in this row */
  protected readonly current = computed(() => ({ ...this.event(), offsets: this.on() ? this.offsets() : null }));
  protected readonly summary = computed(() => this.offsets().map((minutes) => reminderLabel(minutes, this.t())));
  protected readonly stopping = signal(false);
  protected readonly stopFailed = signal(false);

  protected readonly name = computed(() => (this.i18n.lang() === 'cs' && this.event().name_cs) || this.event().name_sk);
  protected readonly repeat = computed(() =>
    this.event().irregular ? this.t().repeat.irregular : repeatLabel(this.event().repeat_days, this.t()),
  );
  /** null: an irregular event without a next date yet */
  private readonly start = computed(() => {
    const start = this.event().next_start;
    return start ? new Date(start) : null;
  });
  /** "so 10. 10. 20:00" in the player's own time zone (year only when it is not this year) */
  protected readonly when = computed(() => {
    const start = this.start();
    if (!start) return '';
    const locale = this.i18n.locale();
    const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(start);
    const year = start.getFullYear() === new Date().getFullYear() ? '' : ` ${start.getFullYear()}`;
    return `${weekday} ${start.getDate()}. ${start.getMonth() + 1}.${year} ${this.clock(start)}`;
  });
  /** game time */
  protected readonly utc = computed(() => {
    const start = this.start();
    return start ? this.clock(start, 'UTC') : '';
  });

  protected picked(offsets: number[] | null): void {
    this.offsets.set(offsets ?? []);
    this.stopFailed.set(false);
    this.changed.emit(offsets);
  }

  /** "Zrušiť": no more reminders of this event */
  protected async stop(): Promise<void> {
    this.stopping.set(true);
    this.stopFailed.set(false);
    try {
      await this.api.setOffsets(this.event().id, []);
      this.picked(null);
    } catch {
      this.stopFailed.set(true);
    } finally {
      this.stopping.set(false);
    }
  }

  private clock(date: Date, timeZone?: string): string {
    return new Intl.DateTimeFormat(this.i18n.locale(), {
      hour: '2-digit',
      minute: '2-digit',
      timeZone,
    }).format(date);
  }
}

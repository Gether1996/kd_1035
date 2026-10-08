import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { I18n } from '../../../core/i18n/i18n';
import { ReminderEvent } from '../../../core/reminders-api';
import { repeatLabel } from './format';
import { ReminderPicker } from './reminder-picker';

/** One event in "Pripomienky eventov": when it starts, then the switch and the times (ReminderPicker). */
@Component({
  selector: 'li[appEventRow]',
  imports: [ReminderPicker],
  templateUrl: './event-row.html',
  styleUrl: './event-row.scss',
  host: { class: 'event' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventRow {
  readonly event = input.required<ReminderEvent>();

  private readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.t().reminders);

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

  private clock(date: Date, timeZone?: string): string {
    return new Intl.DateTimeFormat(this.i18n.locale(), {
      hour: '2-digit',
      minute: '2-digit',
      timeZone,
    }).format(date);
  }
}

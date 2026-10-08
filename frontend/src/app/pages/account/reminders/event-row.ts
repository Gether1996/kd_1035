import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { I18n } from '../../../core/i18n/i18n';
import { MAX_MINUTES, MAX_REMINDERS, ReminderEvent, RemindersApi } from '../../../core/reminders-api';
import { Icon } from '../../../shared/icon';
import { reminderLabel, repeatLabel } from './format';

/** Offered first when a player switches on an event that offers no times. */
const DEFAULT_MINUTES = 10;

/**
 * One event in "Pripomienky eventov": when it starts, the on/off switch and the times before the start.
 * Every change is saved at once; changes made while a save is running are sent right after it, in order.
 */
@Component({
  selector: 'li[appEventRow]',
  imports: [Icon],
  templateUrl: './event-row.html',
  styleUrl: './event-row.scss',
  host: { class: 'event', '[class.is-on]': 'on()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventRow {
  readonly event = input.required<ReminderEvent>();

  private readonly api = inject(RemindersApi);
  private readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.t().reminders);
  protected readonly max = MAX_MINUTES;

  /** the player's times, largest first; [] = not reminded */
  protected readonly offsets = linkedSignal(() => this.event().offsets ?? []);
  protected readonly on = computed(() => this.offsets().length > 0);
  protected readonly full = computed(() => this.offsets().length >= MAX_REMINDERS);
  protected readonly offered = computed(() => [...this.event().offered].sort((a, b) => a - b));
  /** times the player typed in, not among the offered ones */
  protected readonly own = computed(() =>
    this.offsets()
      .filter((minutes) => !this.event().offered.includes(minutes))
      .sort((a, b) => a - b),
  );
  protected readonly state = signal<'saved' | 'failed' | null>(null);
  protected readonly invalid = signal(false);

  protected readonly name = computed(() => (this.i18n.lang() === 'cs' && this.event().name_cs) || this.event().name_sk);
  protected readonly repeat = computed(() => repeatLabel(this.event().repeat_days, this.t()));
  private readonly start = computed(() => new Date(this.event().next_start));
  /** "so 10. 10. 20:00" in the player's own time zone (year only when it is not this year) */
  protected readonly when = computed(() => {
    const start = this.start();
    const locale = this.i18n.locale();
    const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(start);
    const year = start.getFullYear() === new Date().getFullYear() ? '' : ` ${start.getFullYear()}`;
    return `${weekday} ${start.getDate()}. ${start.getMonth() + 1}.${year} ${this.clock(start)}`;
  });
  /** game time */
  protected readonly utc = computed(() => this.clock(this.start(), 'UTC'));

  /** the last choice comes back when the switch goes on again */
  private previous: number[] = [];
  private saving = false;
  private queued = false;

  protected label(minutes: number): string {
    return reminderLabel(minutes, this.t());
  }

  protected has(minutes: number): boolean {
    return this.offsets().includes(minutes);
  }

  protected toggle(): void {
    if (this.on()) {
      this.previous = this.offsets();
      this.change([]);
    } else {
      this.change(this.previous.length ? this.previous : [this.offered()[0] ?? DEFAULT_MINUTES]);
    }
  }

  protected toggleTime(minutes: number): void {
    if (this.has(minutes)) this.change(this.offsets().filter((m) => m !== minutes));
    else if (!this.full()) this.change([...this.offsets(), minutes]);
  }

  protected addTime(event: Event, input: HTMLInputElement): void {
    event.preventDefault();
    if (this.full()) return; // the hint below says why
    const minutes = Number(input.value);
    if (!input.value.trim() || !Number.isInteger(minutes) || minutes < 0 || minutes > MAX_MINUTES) {
      this.invalid.set(true);
      return;
    }
    input.value = '';
    if (!this.has(minutes)) this.change([...this.offsets(), minutes]);
  }

  private change(offsets: number[]): void {
    this.offsets.set([...offsets].sort((a, b) => b - a));
    this.invalid.set(false);
    void this.save();
  }

  private async save(): Promise<void> {
    if (this.saving) {
      this.queued = true;
      return;
    }
    this.saving = true;
    this.state.set(null);
    try {
      do {
        this.queued = false;
        await this.api.setOffsets(this.event().id, this.offsets());
      } while (this.queued);
      this.state.set('saved');
    } catch {
      this.state.set('failed');
    } finally {
      this.saving = false;
    }
  }

  private clock(date: Date, timeZone?: string): string {
    return new Intl.DateTimeFormat(this.i18n.locale(), { hour: '2-digit', minute: '2-digit', timeZone }).format(date);
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { I18n } from '../../../core/i18n/i18n';
import { MAX_MINUTES, MAX_REMINDERS, ReminderEvent, RemindersApi } from '../../../core/reminders-api';
import { Icon } from '../../../shared/icon';
import { reminderLabel } from './format';

/** Offered first when a player switches on an event that offers no times. */
const DEFAULT_MINUTES = 10;

/** The own time as typed: days, hours and minutes, each optional (empty = 0). */
export interface OwnTime {
  days: string;
  hours: string;
  minutes: string;
}

/** Whole minutes 1–10080 from the three fields, null when a field is not a whole number ≥ 0 or the total is out of
 * range (0 = "at the start" is offered as a chip by leadership, not typed). */
export function ownMinutes({ days, hours, minutes }: OwnTime): number | null {
  const parts = [days, hours, minutes].map((value) => (value.trim() ? Number(value) : 0));
  if (parts.some((n) => !Number.isInteger(n) || n < 0)) return null;
  const total = parts[0] * 1440 + parts[1] * 60 + parts[2];
  return total >= 1 && total <= MAX_MINUTES ? total : null;
}

/**
 * The player's reminders of one event: the on/off switch, the offered times and an own time (days + hours + minutes).
 * Used on /ucet (EventRow) and in the event dialog of the calendar. Projected content is shown next to the switch.
 * Every change is saved at once; changes made while a save is running are sent right after it, in order.
 */
@Component({
  selector: 'app-reminder-picker',
  imports: [Icon],
  templateUrl: './reminder-picker.html',
  styleUrl: './reminder-picker.scss',
  host: { '[class.is-on]': 'on()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReminderPicker {
  readonly event = input.required<ReminderEvent>();
  /** id of the element naming the event, read with the switch */
  readonly describedBy = input<string>();
  /** the player's times after every change (null = not reminded), so a parent can keep its copy current */
  readonly changed = output<number[] | null>();

  private readonly api = inject(RemindersApi);
  private readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.t().reminders);

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
  protected readonly name = computed(() => (this.i18n.lang() === 'cs' && this.event().name_cs) || this.event().name_sk);
  protected readonly state = signal<'saved' | 'failed' | null>(null);
  protected readonly invalid = signal(false);

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

  protected addTime(event: Event, days: HTMLInputElement, hours: HTMLInputElement, mins: HTMLInputElement): void {
    event.preventDefault();
    if (this.full()) return; // the hint below says why
    const minutes = ownMinutes({ days: days.value, hours: hours.value, minutes: mins.value });
    // a number input reports '' for text it cannot read ("1,5"): badInput tells it apart from an empty field
    if (minutes === null || [days, hours, mins].some((field) => field.validity?.badInput)) {
      this.invalid.set(true);
      return;
    }
    days.value = hours.value = mins.value = '';
    if (!this.has(minutes)) this.change([...this.offsets(), minutes]);
  }

  private change(offsets: number[]): void {
    this.offsets.set([...offsets].sort((a, b) => b - a));
    this.invalid.set(false);
    this.changed.emit(this.offsets().length ? this.offsets() : null);
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
}

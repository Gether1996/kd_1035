import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { Alarm, AlarmError, AlarmsApi } from '../../core/alarms-api';
import { I18n } from '../../core/i18n/i18n';
import { Icon } from '../../shared/icon';
import { duration } from './format';

/** "pripomenúť … vopred" choices, minutes */
export const LEADS = [0, 5, 15, 30, 60];

/** The moment of the thing: in days/hours/minutes from now, or a local date and time ("2026-10-12T19:30"). */
export function targetOf(
  mode: 'in' | 'at',
  parts: { days: number; hours: number; minutes: number },
  local: string,
  now: Date,
): Date | null {
  if (mode === 'at') {
    const date = local ? new Date(local) : null;
    return date && !isNaN(date.getTime()) ? date : null;
  }
  const minutes = parts.days * 1440 + parts.hours * 60 + parts.minutes;
  return minutes > 0 ? new Date(now.getTime() + minutes * 60_000) : null;
}

/**
 * "Budíky" on /pripomienky: one-off DMs from the bot ("my shield ends in 7 h 30 min, remind me 15 min before"). The
 * player gives the time as "in …" (the game shows countdowns) or as a date and time; the worker sends it
 * (backend accounts/alarms.py).
 */
@Component({
  selector: 'app-alarms',
  imports: [Icon],
  templateUrl: './alarms.html',
  styleUrls: ['./reminder-picker.scss', './alarms.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Alarms {
  /** the bot's messages are switched off – nothing would arrive */
  readonly off = input(false);

  private readonly api = inject(AlarmsApi);
  protected readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.t().alarms);
  protected readonly leads = LEADS;

  protected readonly data = this.api.list();
  protected readonly alarms = linkedSignal<Alarm[]>(() => (this.data.hasValue() ? this.data.value().alarms : []));
  protected readonly max = computed(() => (this.data.hasValue() ? this.data.value().max : 5));
  protected readonly full = computed(() => this.alarms().length >= this.max());

  protected readonly now = signal(new Date());
  protected readonly open = signal(false);
  protected readonly mode = signal<'in' | 'at'>('in');
  protected readonly days = signal(0);
  protected readonly hours = signal(0);
  protected readonly minutes = signal(0);
  protected readonly local = signal('');
  protected readonly lead = signal(0);
  protected readonly note = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal<AlarmError | 'empty' | null>(null);
  protected readonly removing = signal<ReadonlySet<number>>(new Set());

  protected readonly target = computed(() =>
    targetOf(this.mode(), { days: this.days(), hours: this.hours(), minutes: this.minutes() }, this.local(), this.now()),
  );
  /** "Bot ti napíše ne 12. 10. o 19:15." under the form */
  protected readonly summary = computed(() => {
    const target = this.target();
    if (!target) return '';
    return this.t().summary.replace('{time}', this.when(new Date(target.getTime() - this.lead() * 60_000)));
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      // the list's "o 2 h 10 min" and the form's "in …" move on with the clock
      const timer = setInterval(() => this.now.set(new Date()), 30_000);
      destroyRef.onDestroy(() => clearInterval(timer));
    });
  }

  protected toggle(): void {
    this.open.update((open) => !open);
    this.error.set(null);
  }

  protected number(value: string, max: number): number {
    const n = Math.floor(Number(value));
    return Number.isFinite(n) ? Math.min(Math.max(n, 0), max) : 0;
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    if (this.saving() || this.full()) return;
    this.now.set(new Date());
    const target = this.target();
    if (!target) {
      this.error.set('empty');
      return;
    }
    this.saving.set(true);
    const result = await this.api.add(target, this.lead(), this.note().trim());
    this.saving.set(false);
    if (typeof result === 'string') {
      this.error.set(result);
      return;
    }
    this.alarms.update((list) => [...list, result].sort((a, b) => a.remind_at.localeCompare(b.remind_at)));
    this.error.set(null);
    this.open.set(false);
    this.days.set(0);
    this.hours.set(0);
    this.minutes.set(0);
    this.local.set('');
    this.note.set('');
  }

  protected async remove(alarm: Alarm): Promise<void> {
    this.removing.update((set) => new Set(set).add(alarm.id));
    const ok = await this.api.remove(alarm.id);
    this.removing.update((set) => {
      const next = new Set(set);
      next.delete(alarm.id);
      return next;
    });
    if (ok) this.alarms.update((list) => list.filter((a) => a.id !== alarm.id));
  }

  /** "ne 12. 10. 19:15" in the visitor's time */
  protected when(date: Date | string): string {
    return new Intl.DateTimeFormat(this.i18n.locale(), {
      weekday: 'short',
      day: 'numeric',
      month: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date));
  }

  /** "o 2 h 10 min" until the bot writes */
  protected left(alarm: Alarm): string {
    const minutes = Math.max(1, Math.ceil((new Date(alarm.remind_at).getTime() - this.now().getTime()) / 60_000));
    return this.t().in.replace('{time}', duration(minutes, this.i18n.t().reminders));
  }

  protected leadLabel(minutes: number): string {
    return minutes ? this.i18n.t().reminders.before.replace('{time}', duration(minutes, this.i18n.t().reminders)) : this.t().atTime;
  }
}

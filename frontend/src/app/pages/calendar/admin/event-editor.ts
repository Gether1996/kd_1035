import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  EventFields,
  EventsAdminApi,
  FieldErrors,
  ManageData,
  ManagedEvent,
  TimeBasis,
} from '../../../core/events-admin-api';
import { I18n } from '../../../core/i18n/i18n';
import { EventIcon } from '../../../shared/event-icon';
import { Icon } from '../../../shared/icon';
import { plural, reminderLabel } from '../../reminders/format';
import { KINGDOM_ZONE, shiftDate, toInstant, wallClock, zoneOf } from './zone';

export type Kind = 'once' | 'repeat' | 'irregular';

/** times offered to players to pick from (plus the ones the event already has) */
const PLAYER_PRESETS = [5, 10, 15, 30, 60, 180, 720, 1440, 2880];
const MAX_OFFERED = 6;
const REPEAT_PRESETS = [7, 14, 28, 56];

/** "1 d 2 h 30 min" → minutes; null when a part is not a whole number ≥ 0. Empty fields = 0. */
export function durationMinutes(days: string, hours: string, minutes: string): number | null {
  const parts = [days, hours, minutes].map((value) => (value.trim() ? Number(value) : 0));
  if (parts.some((n) => !Number.isInteger(n) || n < 0)) return null;
  return parts[0] * 1440 + parts[1] * 60 + parts[2];
}

export function kindOf(event: ManagedEvent | null): Kind {
  if (!event) return 'once';
  return event.irregular ? 'irregular' : event.repeat_days ? 'repeat' : 'once';
}

/**
 * Create or edit a kingdom event (superusers, in the calendar): the same fields and rules as the Django admin, laid
 * out for people – a picture for the icon, the kind of repeat, the start in our time or in UTC with the other one
 * shown, Discord and player reminders as chips. The server validates again and its errors show at the fields.
 */
@Component({
  selector: 'app-event-editor',
  imports: [Icon, EventIcon],
  templateUrl: './event-editor.html',
  styleUrl: './event-editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventEditor {
  readonly data = input.required<ManageData>();
  /** null = a new event */
  readonly event = input<ManagedEvent | null>(null);
  /** a new event: the day clicked in the calendar (YYYY-MM-DD) */
  readonly day = input<string | null>(null);
  readonly closed = output<void>();
  /** saved or deleted – the calendar loads again */
  readonly changed = output<void>();

  private readonly api = inject(EventsAdminApi);
  protected readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.t().eventAdmin);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly kinds: Kind[] = ['once', 'repeat', 'irregular'];
  protected readonly bases: TimeBasis[] = ['local', 'utc'];
  protected readonly repeatPresets = REPEAT_PRESETS;

  // ---------------------------------------------------------------- the form

  protected readonly nameSk = linkedSignal(() => this.event()?.name_sk ?? '');
  protected readonly nameCs = linkedSignal(() => this.event()?.name_cs ?? '');
  protected readonly icon = linkedSignal(() => this.event()?.icon ?? '');
  protected readonly kind = linkedSignal<Kind>(() => kindOf(this.event()));
  protected readonly every = linkedSignal(() => String(this.event()?.repeat_days || 14));
  protected readonly until = linkedSignal(() => this.event()?.until ?? '');
  protected readonly basis = linkedSignal<TimeBasis>(() => this.event()?.time_basis ?? 'local');
  /** the start on the wall clock of the time basis; an irregular event without a date has only its usual hour */
  private readonly when = linkedSignal(() => {
    const event = this.event();
    if (!event)
      return { date: this.day() ?? wallClock(Date.now(), KINGDOM_ZONE).date, time: '20:00' };
    const zone = zoneOf(event.time_basis);
    if (event.irregular) {
      return event.next_start
        ? wallClock(event.next_start, zone)
        : { date: '', time: event.usual_time };
    }
    return wallClock(event.starts_at, zone);
  });
  protected readonly date = linkedSignal(() => this.when().date);
  protected readonly time = linkedSignal(() => this.when().time);
  private readonly length = linkedSignal(() => {
    const minutes = this.event()?.duration_minutes ?? 60;
    const part = (n: number) => (n ? String(n) : '');
    return {
      days: part(Math.floor(minutes / 1440)),
      hours: part(Math.floor((minutes % 1440) / 60)),
      minutes: part(minutes % 60),
    };
  });
  protected readonly durDays = linkedSignal(() => this.length().days);
  protected readonly durHours = linkedSignal(() => this.length().hours);
  protected readonly durMinutes = linkedSignal(() => this.length().minutes);
  protected readonly notify = linkedSignal(() => this.event()?.notify_discord ?? true);
  protected readonly reminders = linkedSignal(() => this.event()?.reminders ?? [60]);
  protected readonly mention = linkedSignal(() => this.event()?.mention_role ?? true);
  protected readonly roleId = linkedSignal(() => this.event()?.mention_role_id ?? '');
  protected readonly message = linkedSignal(() => this.event()?.message ?? '');
  protected readonly offered = linkedSignal(() => this.event()?.player_reminders ?? [10, 60]);
  protected readonly guide = linkedSignal(() => this.event()?.guide ?? null);
  protected readonly web = linkedSignal(() => this.event()?.show_on_web ?? true);
  protected readonly active = linkedSignal(() => this.event()?.is_active ?? true);

  protected readonly errors = signal<FieldErrors>({});
  protected readonly state = signal<'failed' | 'error' | null>(null);
  protected readonly busy = signal(false);
  protected readonly confirming = signal(false);

  // ---------------------------------------------------------------- derived

  protected readonly title = computed(() => this.nameSk().trim() || this.t().newTitle);
  protected readonly iconUrl = computed(
    () => this.data().icons.find((i) => i.slug === this.icon())?.url ?? null,
  );
  private readonly zone = computed(() => zoneOf(this.basis()));
  private readonly start = computed(() => toInstant(this.date(), this.time(), this.zone()));
  /** the same moment in the other time: "= UTC 18:00" or "= 02:00 náš čas" (with the day when it differs) */
  protected readonly other = computed(() => {
    const start = this.start();
    if (!start) return '';
    const t = this.t();
    const local = this.basis() === 'local';
    const shown = wallClock(start, local ? 'UTC' : KINGDOM_ZONE);
    const day =
      shown.date === this.date()
        ? ''
        : `${Number(shown.date.slice(8))}. ${Number(shown.date.slice(5, 7))}. `;
    const time = local ? `UTC ${day}${shown.time}` : `${day}${shown.time} ${t.zones.local}`;
    return t.other.replace('{time}', time);
  });
  protected readonly duration = computed(() =>
    durationMinutes(this.durDays(), this.durHours(), this.durMinutes()),
  );
  protected readonly reminderChoices = computed(() => this.data().reminder_choices);
  protected readonly playerChoices = computed(() =>
    [...new Set([...PLAYER_PRESETS, ...this.offered()])].sort((a, b) => a - b),
  );
  protected readonly offeredFull = computed(() => this.offered().length >= MAX_OFFERED);
  protected readonly players = computed(() => {
    const event = this.event();
    return event ? plural(event.players, this.t().players) : '';
  });

  constructor() {
    const doc = inject(DOCUMENT);
    afterNextRender(() => {
      const dialog = this.dialog().nativeElement;
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      doc.body.style.overflow = 'hidden';
    });
    inject(DestroyRef).onDestroy(() => (doc.body.style.overflow = ''));
  }

  protected label(minutes: number): string {
    return reminderLabel(minutes, this.i18n.t().reminders);
  }

  protected error(field: keyof FieldErrors): string {
    return this.errors()[field]?.[0] ?? '';
  }

  protected toggleIn(list: 'reminders' | 'offered', minutes: number): void {
    const target = this[list];
    target.update((values) =>
      values.includes(minutes)
        ? values.filter((m) => m !== minutes)
        : [...values, minutes].sort((a, b) => b - a),
    );
  }

  protected guideTitle(guide: ManageData['guides'][number]): string {
    const title = (this.i18n.lang() === 'cs' && guide.title_cs) || guide.title_sk;
    return guide.published ? title : `${title} (${this.t().unpublished})`;
  }

  protected setGuide(value: string): void {
    this.guide.set(value ? Number(value) : null);
  }

  protected close(): void {
    const dialog = this.dialog().nativeElement;
    if (dialog.open && typeof dialog.close === 'function') dialog.close();
    else this.closed.emit();
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    const fields = this.fields();
    if (!fields) return;
    this.busy.set(true);
    this.state.set(null);
    try {
      const current = this.event();
      if (current) await this.api.update(current.id, fields);
      else await this.api.create(fields);
      this.changed.emit();
      this.close();
    } catch (error) {
      this.failed(error);
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const current = this.event();
    if (!current) return;
    if (!this.confirming()) {
      this.confirming.set(true);
      return;
    }
    this.busy.set(true);
    this.state.set(null);
    try {
      await this.api.remove(current.id);
      this.changed.emit();
      this.close();
    } catch (error) {
      this.failed(error);
    } finally {
      this.busy.set(false);
    }
  }

  /** What goes to the server, or null after marking the fields that need fixing. */
  private fields(): Partial<EventFields> | null {
    const t = this.t();
    const errors: FieldErrors = {};
    const kind = this.kind();
    const every = Number(this.every());
    const duration = this.duration();
    if (!this.nameSk().trim()) errors.name_sk = [t.required];
    if (kind === 'repeat' && !(Number.isInteger(every) && every >= 1 && every <= 32767))
      errors.repeat_days = [t.invalid];
    if (duration === null) errors.duration_minutes = [t.invalid];
    // an irregular event may stay without a date; then only its usual hour counts
    const noDate = kind === 'irregular' && !this.date();
    let start = noDate
      ? toInstant(
          shiftDate(
            wallClock(Date.now(), this.zone()).date,
            -2 - Math.ceil((duration ?? 0) / 1440),
          ),
          this.time(),
          this.zone(),
        )
      : this.start();
    if (!start) {
      errors.starts_at = [t.required];
      start = '';
    }
    this.errors.set(errors);
    if (Object.keys(errors).length) {
      this.state.set('failed');
      return null;
    }
    return {
      name_sk: this.nameSk().trim(),
      name_cs: this.nameCs().trim(),
      icon: this.icon(),
      message: this.message(),
      starts_at: start,
      duration_minutes: duration ?? 0,
      repeat_days: kind === 'repeat' ? every : 0,
      until: kind === 'repeat' && this.until() ? this.until() : null,
      irregular: kind === 'irregular',
      time_basis: this.basis(),
      reminders: this.reminders(),
      notify_discord: this.notify(),
      mention_role: this.mention(),
      mention_role_id: this.roleId().trim(),
      show_on_web: this.web(),
      player_reminders: this.offered(),
      guide: this.guide(),
      is_active: this.active(),
    };
  }

  private failed(error: unknown): void {
    if (
      error instanceof HttpErrorResponse &&
      error.status === 400 &&
      error.error &&
      typeof error.error === 'object'
    ) {
      this.errors.set(error.error as FieldErrors);
      this.state.set('failed');
    } else {
      this.state.set('error');
    }
  }
}

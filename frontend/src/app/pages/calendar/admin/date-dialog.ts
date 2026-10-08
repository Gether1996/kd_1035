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
import { EventsAdminApi, ManageData, ManagedEvent } from '../../../core/events-admin-api';
import { I18n } from '../../../core/i18n/i18n';
import { EventIcon } from '../../../shared/event-icon';
import { Icon } from '../../../shared/icon';
import { KINGDOM_ZONE, toInstant, wallClock, zoneOf } from './zone';

/**
 * The quick way to give an irregular event (Silk Road, Shadow Legion…) its next date: pick the event, the day
 * (prefilled with the day clicked in the calendar) and the time – its usual hour is prefilled, in our time or in UTC
 * as the event keeps it. A date set before is replaced; it can also be cancelled.
 */
@Component({
  selector: 'app-date-dialog',
  imports: [Icon, EventIcon],
  templateUrl: './date-dialog.html',
  styleUrl: './date-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DateDialog {
  readonly data = input.required<ManageData>();
  /** the day clicked in the calendar (YYYY-MM-DD) */
  readonly day = input<string | null>(null);
  /** the event to set (from its dialog or the list); null = the first one */
  readonly eventId = input<number | null>(null);
  readonly closed = output<void>();
  readonly changed = output<void>();
  /** "Iný event v tento deň": the editor for a new event on the day */
  readonly create = output<string | null>();

  private readonly api = inject(EventsAdminApi);
  protected readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.t().eventAdmin);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly events = computed(() =>
    this.data().events.filter((event) => event.irregular && event.is_active),
  );
  protected readonly chosenId = linkedSignal(() => this.eventId() ?? this.events()[0]?.id ?? null);
  protected readonly chosen = computed(
    () => this.events().find((event) => event.id === this.chosenId()) ?? null,
  );
  private readonly zone = computed(() => zoneOf(this.chosen()?.time_basis ?? 'local'));
  /** the clicked day, else the date the event has, else today */
  protected readonly date = linkedSignal<ManagedEvent | null, string>({
    source: this.chosen,
    computation: (event, previous) => {
      if (previous) return previous.value; // another event keeps the day already chosen
      if (this.day()) return this.day()!;
      if (event?.next_start) return wallClock(event.next_start, zoneOf(event.time_basis)).date;
      return wallClock(Date.now(), KINGDOM_ZONE).date;
    },
  });
  /** the hour of its current date, or its usual hour – follows the chosen event */
  protected readonly time = linkedSignal(() => {
    const event = this.chosen();
    if (!event) return '20:00';
    return event.next_start
      ? wallClock(event.next_start, zoneOf(event.time_basis)).time
      : event.usual_time;
  });
  protected readonly zoneLabel = computed(
    () => this.t().zones[this.chosen()?.time_basis ?? 'local'],
  );
  private readonly start = computed(() => toInstant(this.date(), this.time(), this.zone()));
  /** the same moment in the other time */
  protected readonly other = computed(() => {
    const start = this.start();
    if (!start) return '';
    const utcBasis = this.chosen()?.time_basis === 'utc';
    const shown = wallClock(start, utcBasis ? KINGDOM_ZONE : 'UTC');
    const day =
      shown.date === this.date()
        ? ''
        : `${Number(shown.date.slice(8))}. ${Number(shown.date.slice(5, 7))}. `;
    const time = utcBasis
      ? `${day}${shown.time} ${this.t().zones.local}`
      : `UTC ${day}${shown.time}`;
    return this.t().other.replace('{time}', time);
  });
  /** "Teraz má termín pi 23. 10. 20:00 – presunie sa." */
  protected readonly replaces = computed(() => {
    const event = this.chosen();
    return event?.next_start
      ? this.t().replaces.replace('{date}', this.when(event.next_start))
      : '';
  });

  protected readonly busy = signal(false);
  protected readonly error = signal('');

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

  protected name(event: ManagedEvent): string {
    return (this.i18n.lang() === 'cs' && event.name_cs) || event.name_sk;
  }

  /** "pi 23. 10. 20:00" in the visitor's time */
  protected when(iso: string): string {
    const date = new Date(iso);
    const locale = this.i18n.locale();
    const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date);
    const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(
      date,
    );
    return `${weekday} ${date.getDate()}. ${date.getMonth() + 1}. ${time}`;
  }

  protected close(): void {
    const dialog = this.dialog().nativeElement;
    if (dialog.open && typeof dialog.close === 'function') dialog.close();
    else this.closed.emit();
  }

  protected backdrop(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.close();
  }

  protected newEvent(): void {
    this.create.emit(this.date() || this.day());
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    const chosen = this.chosen();
    const start = this.start();
    if (!chosen) return;
    if (!start) {
      this.error.set(this.t().invalid);
      return;
    }
    await this.run(() => this.api.setDate(chosen.id, start));
  }

  protected async clear(): Promise<void> {
    const chosen = this.chosen();
    if (chosen) await this.run(() => this.api.clearDate(chosen.id));
  }

  private async run(call: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await call();
      this.changed.emit();
      this.close();
    } catch (error) {
      const start =
        error instanceof HttpErrorResponse && error.status === 400 ? error.error?.start?.[0] : '';
      this.error.set(start || this.t().error);
    } finally {
      this.busy.set(false);
    }
  }
}

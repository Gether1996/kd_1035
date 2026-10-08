import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { EventsAdminApi, ManageData, ManagedEvent } from '../../../core/events-admin-api';
import { I18n } from '../../../core/i18n/i18n';
import { EventIcon } from '../../../shared/event-icon';
import { Icon } from '../../../shared/icon';
import { plural, repeatLabel } from '../../account/reminders/format';

/**
 * "Správa eventov" under the calendar, for superusers only: every event (inactive drafts too) on one line each –
 * what it is, when it runs next, who picked it – with a switch to turn it on or off, the editor and, for irregular
 * events, their next date.
 */
@Component({
  selector: 'app-events-panel',
  imports: [Icon, EventIcon],
  templateUrl: './events-panel.html',
  styleUrl: './events-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventsPanel {
  readonly data = input<ManageData | null>(null);
  readonly failed = input(false);
  /** the editor: an event id, or null for a new event */
  readonly edit = output<number | null>();
  /** the next date of an irregular event (null = choose in the dialog) */
  readonly schedule = output<number | null>();
  readonly changed = output<void>();

  private readonly api = inject(EventsAdminApi);
  protected readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.t().eventAdmin);
  protected readonly events = computed(() => this.data()?.events ?? []);
  protected readonly hasIrregular = computed(() =>
    this.events().some((e) => e.irregular && e.is_active),
  );
  /** switches being saved, so a double click does not send twice */
  protected readonly saving = signal<ReadonlySet<number>>(new Set());
  protected readonly error = signal(false);

  protected name(event: ManagedEvent): string {
    return (this.i18n.lang() === 'cs' && event.name_cs) || event.name_sk;
  }

  protected kind(event: ManagedEvent): string {
    const texts = this.i18n.t().reminders;
    return event.irregular ? texts.repeat.irregular : repeatLabel(event.repeat_days, texts);
  }

  protected players(event: ManagedEvent): string {
    return plural(event.players, this.t().players);
  }

  /** "pi 23. 10. 20:00 · UTC 18:00" */
  protected when(event: ManagedEvent): string {
    if (!event.next_start) return this.t().noDate;
    const date = new Date(event.next_start);
    const locale = this.i18n.locale();
    const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date);
    const clock = (timeZone?: string) =>
      new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone }).format(
        date,
      );
    return `${weekday} ${date.getDate()}. ${date.getMonth() + 1}. ${clock()} · UTC ${clock('UTC')}`;
  }

  protected async toggle(
    event: ManagedEvent,
    active: boolean,
    input: HTMLInputElement,
  ): Promise<void> {
    this.saving.update((ids) => new Set(ids).add(event.id));
    this.error.set(false);
    try {
      await this.api.update(event.id, { is_active: active });
      this.changed.emit();
    } catch {
      input.checked = !active; // e.g. an active twin – the editor says why
      this.error.set(true);
    } finally {
      this.saving.update((ids) => {
        const next = new Set(ids);
        next.delete(event.id);
        return next;
      });
    }
  }
}

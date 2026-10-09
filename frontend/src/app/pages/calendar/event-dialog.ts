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
  output,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { EventGuide, PublicEvent, eventName, isOccurrence } from '../../core/events-api';
import { I18n } from '../../core/i18n/i18n';
import { ReminderEvent } from '../../core/reminders-api';
import { EventIcon } from '../../shared/event-icon';
import { Icon } from '../../shared/icon';
import { repeatLabel } from '../reminders/format';
import { ReminderPicker } from '../reminders/reminder-picker';
import { clock, dayKey, longDay, numericDay } from './month';

/** The reminders part of the dialog: nothing (login off), a login button, or the player's own choice. */
export interface RemindState {
  kind: 'none' | 'login' | 'loading' | 'error' | 'player';
  loginUrl?: string;
  /** the player's choice for this event; null = the event will not run again */
  event?: ReminderEvent | null;
  /** no channel reaches the player (Discord DM off or unavailable and no browser with notifications) */
  noChannel?: boolean;
}

/**
 * Details of one event from the calendar in a modal <dialog> (a bottom sheet on phones): when it runs in the visitor's
 * time and in UTC, its guide and – for a signed-in player – the same reminder controls as on /ucet.
 * Esc, the close button and a click outside close it; the page puts the focus back on the event.
 */
@Component({
  selector: 'app-event-dialog',
  imports: [RouterLink, Icon, EventIcon, ReminderPicker],
  templateUrl: './event-dialog.html',
  styleUrl: './event-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventDialog {
  /** an occurrence from the calendar, or an irregular event still without a date */
  readonly item = input.required<PublicEvent>();
  readonly now = input.required<Date>();
  readonly remind = input.required<RemindState>();
  /** opened on /pripomienky: the note pointing to that page is left out */
  readonly onAccount = input(false);
  /** a superuser: buttons to edit the event and to set the date of an irregular one */
  readonly admin = input(false);
  readonly closed = output<void>();
  /** the player changed the reminders of this event (already being saved) */
  readonly changed = output<{ id: number; offsets: number[] | null }>();
  /** superuser: open the event editor / the date of an irregular event */
  readonly edit = output<number>();
  readonly schedule = output<number>();

  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly occurrence = computed(() => {
    const item = this.item();
    return isOccurrence(item) ? item : null;
  });
  protected readonly name = computed(() => eventName(this.item(), this.i18n.lang()));
  protected readonly repeat = computed(() => {
    const o = this.occurrence();
    const texts = this.t().reminders;
    return !o || o.irregular ? texts.repeat.irregular : repeatLabel(o.repeat_days, texts);
  });
  /** no fixed cycle: a waiting event (no date yet) or an irregular occurrence */
  protected readonly irregular = computed(() => {
    const o = this.occurrence();
    return !o || o.irregular;
  });
  protected readonly running = computed(() => {
    const o = this.occurrence();
    const now = this.now().getTime();
    return !!o?.end && Date.parse(o.start) <= now && now < Date.parse(o.end);
  });
  /** "pondelok 5. októbra · 02:00 – nedeľa 11. októbra · 02:00" in the visitor's time zone */
  protected readonly local = computed(() => {
    const o = this.occurrence();
    if (!o) return '';
    const locale = this.i18n.locale();
    const day = (date: Date) => `${longDay(dayKey(date), locale)} · ${clock(date, locale)}`;
    const start = new Date(o.start);
    if (!o.end) return day(start);
    const end = new Date(o.end);
    return dayKey(end) === dayKey(start)
      ? `${day(start)} – ${clock(end, locale)}`
      : `${day(start)} – ${day(end)}`;
  });
  /** "5. 10. 00:00 – 11. 10. 00:00" – game time */
  protected readonly utc = computed(() => {
    const o = this.occurrence();
    if (!o) return '';
    const locale = this.i18n.locale();
    const day = (date: Date) => `${numericDay(dayKey(date, 'UTC'))} ${clock(date, locale, 'UTC')}`;
    const start = new Date(o.start);
    if (!o.end) return day(start);
    const end = new Date(o.end);
    const sameDay = dayKey(end, 'UTC') === dayKey(start, 'UTC');
    return `${day(start)} – ${sameDay ? clock(end, locale, 'UTC') : day(end)}`;
  });

  constructor() {
    const doc = inject(DOCUMENT);
    afterNextRender(() => {
      const dialog = this.dialog().nativeElement;
      // modal: the rest of the page is inert, focus moves in, Esc closes (older test DOMs only know the attribute)
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      doc.body.style.overflow = 'hidden';
    });
    // the page removes the dialog after `closed` (or leaves for the guide)
    inject(DestroyRef).onDestroy(() => (doc.body.style.overflow = ''));
  }

  protected guideTitle(guide: EventGuide): string {
    return (this.i18n.lang() === 'cs' && guide.title_cs) || guide.title_sk;
  }

  protected close(): void {
    const dialog = this.dialog().nativeElement;
    if (dialog.open && typeof dialog.close === 'function')
      dialog.close(); // → (close) → closed
    else this.closed.emit();
  }

  /** a click on the backdrop lands on the <dialog> itself, the content is inside its panel */
  protected backdrop(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.close();
  }
}

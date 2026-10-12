import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router } from '@angular/router';
import { Auth } from '../../core/auth';
import { EventsAdminApi, ManagedEvent } from '../../core/events-admin-api';
import {
  EventsApi,
  IrregularEvent,
  Occurrence,
  PublicEvent,
  eventName,
} from '../../core/events-api';
import { I18n } from '../../core/i18n/i18n';
import { RemindersApi } from '../../core/reminders-api';
import { EventIcon } from '../../shared/event-icon';
import { occurrenceShowsClock } from '../../shared/event-time';
import { Icon } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';
import { repeatLabel } from '../reminders/format';
import { DateDialog } from './admin/date-dialog';
import { eventLink, eventParams, runsOn, validDay } from './deep-link';
import { EventEditor } from './admin/event-editor';
import { EventsPanel } from './admin/events-panel';
import { EventDialog, RemindState } from './event-dialog';
import { GameClock } from './game-clock';
import { Subscribe } from './subscribe';
import {
  Month,
  Week,
  addDays,
  addMonths,
  agenda,
  clock,
  dayKey,
  daysOf,
  isDaily,
  layoutWeeks,
  longDay,
  monthBounds,
  monthOf,
  monthTitle,
  monthWeeks,
  shortDay,
  weekdayNames,
} from './month';

const ACCENTS = ['gold', 'red', 'navy'] as const;

/** ?event= and ?on= as one comparable value, '' without either */
function queryKey(event: unknown, on: unknown): string {
  return event || on ? `${event ?? ''}|${on ?? ''}` : '';
}

/**
 * /kalendar – kingdom events in a month grid (an agenda list on phones), in the visitor's time and in UTC.
 * The prerendered page is only the shell: the month depends on today, so it is built in the browser. Clicking an event
 * opens its details; a signed-in player sets the reminders right there.
 */
@Component({
  selector: 'app-calendar',
  imports: [
    Icon,
    EventIcon,
    PageHeader,
    EventDialog,
    EventsPanel,
    EventEditor,
    DateDialog,
    Subscribe,
    GameClock,
  ],
  templateUrl: './calendar.html',
  styleUrl: './calendar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Calendar {
  /** ?event=<id> – back from the Discord login started in that event's dialog, a link from the home page or a shared
   * one: the event's dialog opens (and keeps it in the address while open) */
  readonly event = input<string>();
  /** ?on=<YYYY-MM-DD> – the month to open and the day of the run (deep-link.ts calendarQuery); a bad value is ignored */
  readonly on = input<string>();

  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** null until the page runs in the browser */
  protected readonly now = signal<Date | null>(null);
  protected readonly month = signal<Month | null>(null);
  protected readonly zone = signal('');

  protected readonly today = computed(() => {
    const now = this.now();
    return now ? dayKey(now) : null;
  });
  private readonly weekRows = computed(() => {
    const month = this.month();
    return month ? monthWeeks(month) : [];
  });
  /** a superuser changed an event – the calendar asks again, past the browser cache */
  private readonly version = signal(0);
  /** the grid and a day more on each side – the server counts days in Bratislava, the visitor may be elsewhere */
  private readonly data = inject(EventsApi).calendar(
    () => {
      const rows = this.weekRows();
      return rows.length
        ? { from: addDays(rows[0][0], -1), to: addDays(rows.at(-1)![6], 1) }
        : null;
    },
    () => this.version(),
  );
  protected readonly loaded = computed(() => this.data.hasValue() && !this.data.isLoading());
  protected readonly failed = computed(() => !!this.data.error());
  private readonly all = computed(() =>
    this.data.hasValue() ? this.data.value().occurrences : [],
  );
  /** the same daily event on every day says little – listed once above the grid */
  protected readonly daily = computed(() => {
    const seen = new Set<number>();
    return this.inMonth(this.all().filter(isDaily)).filter(
      (o) => !seen.has(o.id) && seen.add(o.id),
    );
  });
  private readonly dated = computed(() => this.all().filter((o) => !isDaily(o)));
  protected readonly weeks = computed<Week[]>(() => layoutWeeks(this.weekRows(), this.dated()));
  protected readonly agenda = computed(() => {
    const month = this.month();
    return month ? agenda(this.dated(), month, this.today() ?? undefined) : [];
  });
  /** every irregular event with its next date (or none yet) – the block under the calendar */
  protected readonly irregular = computed(() =>
    this.data.hasValue() ? this.data.value().irregular : [],
  );
  protected readonly empty = computed(() => this.loaded() && !this.inMonth(this.all()).length);

  protected readonly title = computed(() => {
    const month = this.month();
    return month ? monthTitle(month, this.i18n.locale()) : '';
  });
  protected readonly weekdays = computed(() => weekdayNames(this.i18n.locale()));
  protected readonly crumbs = computed(() => [
    { label: this.t().nav.home, link: this.i18n.path('home') },
    { label: this.t().nav.calendar, link: this.i18n.path('calendar') },
  ]);

  // ---------------------------------------------------------------- dialog

  protected readonly selected = signal<PublicEvent | null>(null);
  /** the player's reminders – asked once a player is signed in */
  private readonly reminders = inject(RemindersApi).settings(() => !!this.auth.user());
  protected readonly remind = computed<RemindState>(() => {
    const item = this.selected();
    if (!item || !this.auth.enabled()) return { kind: 'none' };
    if (!this.auth.user())
      return { kind: 'login', loginUrl: this.auth.loginUrl(this.returnPath(item)) };
    if (this.reminders.error()) return { kind: 'error' };
    if (!this.reminders.hasValue()) return { kind: 'loading' };
    const s = this.reminders.value();
    return {
      kind: 'player',
      // missing = the event will not run again (a finished one-off)
      event: s.events.find((e) => e.id === item.id) ?? null,
      // the bot is set up, but the player switched its messages off
      noChannel: s.discord_available && !s.discord,
    };
  });
  /** the event that opened the dialog gets the focus back */
  private trigger: HTMLElement | null = null;
  /** the query the open dialog stands for ('' = none): written by the dialog, or the deep link it was opened from */
  private shown = '';

  // ---------------------------------------------------------------- superuser: event management

  protected readonly admin = computed(() => !!this.auth.user()?.is_superuser);
  protected readonly manage = inject(EventsAdminApi).data(() => this.admin());
  protected readonly manageData = computed(() =>
    this.manage.hasValue() ? this.manage.value() : null,
  );
  /** the editor: the event as it was when opened (a reload does not reset the form), null = a new one */
  protected readonly editing = signal<{ event: ManagedEvent | null; day: string | null } | null>(
    null,
  );
  /** the date of an irregular event: which one (null = choose) and the day clicked */
  protected readonly dating = signal<{ id: number | null; day: string | null } | null>(null);

  constructor() {
    afterNextRender(() => {
      const tick = () => this.now.set(new Date());
      tick();
      this.month.set(monthOf(validDay(this.on()) ?? dayKey(this.now()!)));
      this.zone.set(Intl.DateTimeFormat().resolvedOptions().timeZone ?? '');
      // "Prebieha" and today move on by themselves
      const timer = setInterval(tick, 60_000);
      this.destroyRef.onDestroy(() => clearInterval(timer));
    });

    // ?event= and ?on= open the event's dialog: back from the login started in a dialog, a link from the home page,
    // a shared link, or the other language of this page. The dialog keeps them in the address while it is open
    // (below), so the language switch carries them over; `shown` is the query the dialog already stands for, so
    // writing it, a month change or a reload of the calendar never selects the run again.
    effect(() => {
      const event = this.event();
      const on = this.on();
      if (!this.loaded()) return;
      untracked(() => {
        const key = queryKey(event, on);
        if (key === this.shown) return;
        this.shown = key;
        if (!key) {
          // the query went away (the Kalendár link in the menu): the dialog closes
          this.selected.set(null);
          return;
        }
        const id = Number(event);
        const now = Date.now();
        const day = validDay(on);
        const runs = id ? this.all().filter((o) => o.id === id) : [];
        const item =
          (day ? runs.find((o) => runsOn(o, day)) : undefined) ??
          runs.find((o) => Date.parse(o.end ?? o.start) > now) ??
          this.irregular()
            .filter((e) => e.id === id)
            .map((e) => this.irregularItem(e))[0] ??
          runs.at(-1);
        if (item) this.selected.set(item);
        // nothing to open (an old link, ?on= alone): the query goes; a different run gets its own query below
        else this.writeQuery(null);
      });
    });

    // the open dialog in the address (replaced, no history entry; a query change neither scrolls nor reloads the
    // page – app.ts, core/site-update.ts), gone again once it closes
    effect(() => {
      const item = this.selected();
      untracked(() => this.writeQuery(item));
    });
  }

  private writeQuery(item: PublicEvent | null): void {
    const params = item ? eventParams(item, new Date()) : { event: null, on: null };
    const key = queryKey(params.event, params.on);
    if (key === this.shown) return;
    this.shown = key;
    void this.router.navigate([], {
      queryParams: params,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected shift(months: number): void {
    this.month.update((month) => month && addMonths(month, months));
  }

  protected goToday(): void {
    const today = this.today();
    if (today) this.month.set(monthOf(today));
  }

  protected open(item: PublicEvent, event: Event): void {
    this.trigger = event.currentTarget as HTMLElement;
    this.selected.set(item);
  }

  protected close(): void {
    this.selected.set(null);
    this.returnFocus();
  }

  /** the editor or the date dialog closed: the focus goes back to what opened it (the event bar, the day's "+") */
  protected closeManage(): void {
    this.editing.set(null);
    this.dating.set(null);
    this.returnFocus();
  }

  private returnFocus(): void {
    if (this.trigger?.isConnected) this.trigger.focus();
    this.trigger = null;
  }

  /** "+" on a day: a date for an irregular event (the common case), or straight a new event when there is none */
  protected addOn(day: string, event?: Event): void {
    this.trigger = (event?.currentTarget as HTMLElement | undefined) ?? null;
    const irregular = this.manageData()?.events.some((e) => e.irregular && e.is_active);
    if (irregular) this.dating.set({ id: null, day });
    else this.editing.set({ event: null, day });
  }

  protected editEvent(id: number | null): void {
    const event = id === null ? null : (this.manageData()?.events.find((e) => e.id === id) ?? null);
    if (id !== null && !event) return; // not loaded yet
    // from the event dialog the focus goes back to the event bar, from the events panel to its button
    this.trigger ??= document.activeElement as HTMLElement | null;
    this.selected.set(null);
    this.editing.set({ event, day: null });
  }

  protected scheduleEvent(id: number | null): void {
    // from the event dialog the focus goes back to the event bar, from the events panel to its button
    this.trigger ??= document.activeElement as HTMLElement | null;
    this.selected.set(null);
    this.dating.set({ id, day: null });
  }

  /** "Iný event v tento deň" in the date dialog */
  protected createOn(day: string | null): void {
    this.dating.set(null);
    this.editing.set({ event: null, day });
  }

  /** after a change: the calendar, the list and the player's own reminders load again */
  protected refresh(): void {
    this.version.update((v) => v + 1);
    this.manage.reload();
    this.reminders.reload();
  }

  protected canAdd(day: string): boolean {
    const today = this.today();
    return !!today && day >= today;
  }

  protected addLabel(day: string): string {
    return this.t().eventAdmin.addOn.replace('{date}', longDay(day, this.i18n.locale()));
  }

  /** keeps the copy of the player's reminders current, so the dialog shows the choice when opened again */
  protected changed({ id, offsets }: { id: number; offsets: number[] | null }): void {
    if (!this.reminders.hasValue()) return;
    this.reminders.value.update((s) => ({
      ...s,
      events: s.events.map((e) => (e.id === id ? { ...e, offsets } : e)),
    }));
  }

  // ---------------------------------------------------------------- template helpers

  protected name(item: PublicEvent): string {
    return eventName(item, this.i18n.lang());
  }

  protected accent(item: PublicEvent): string {
    return ACCENTS[item.id % ACCENTS.length];
  }

  protected clock(iso: string, timeZone?: string): string {
    return clock(iso, this.i18n.locale(), timeZone);
  }

  /** an irregular event as the dialog shows it: its next date, or "ďalší termín oznámime" */
  protected irregularItem(event: IrregularEvent): PublicEvent | Occurrence {
    const { start, end, ...base } = event;
    return start ? { ...base, start, end, repeat_days: 0, irregular: true } : base;
  }

  /** "po 5. 10. – po 12. 10.", "so 10. 10. 20:00", "Prebieha · do po 12. 10.", "termín oznámime" */
  protected irregularWhen(event: IrregularEvent): string {
    if (!event.start) return this.t().reminders.noDate;
    const c = this.t().calendar;
    const locale = this.i18n.locale();
    const first = dayKey(new Date(event.start));
    const last = event.end ? dayKey(new Date(event.end)) : first;
    const item = this.irregularItem(event) as Occurrence;
    if (this.running(item)) return `${c.running} · ${c.until.replace('{date}', shortDay(last, locale))}`;
    if (this.timed(item)) return `${shortDay(first, locale)} ${this.clock(event.start)}`;
    return first === last ? shortDay(first, locale) : `${shortDay(first, locale)} – ${shortDay(last, locale)}`;
  }

  /** the start time matters only for short irregular events (an evening Silk Road), not for game events that start
   *  at 00:00 UTC and run for days (Alliance Mobilization, MGE…) */
  protected timed(item: Occurrence): boolean {
    return occurrenceShowsClock(item);
  }

  protected running(item: Occurrence): boolean {
    const now = this.now()?.getTime() ?? 0;
    return !!item.end && Date.parse(item.start) <= now && now < Date.parse(item.end);
  }

  protected isIn(key: string): boolean {
    const month = this.month();
    return !!month && key.slice(0, 7) === monthBounds(month).first.slice(0, 7);
  }

  protected dayNumber(key: string): number {
    return Number(key.slice(8, 10));
  }

  /** CSS grid rows of a week: day numbers, one row per lane, the rest */
  protected rows(week: Week): string {
    return `2.25rem ${week.lanes ? `repeat(${week.lanes}, var(--bar-h))` : ''} minmax(var(--bar-h), 1fr)`;
  }

  protected weekLabel(week: Week): string {
    const locale = this.i18n.locale();
    return this.t()
      .calendar.week.replace('{from}', longDay(week.days[0], locale))
      .replace('{to}', longDay(week.days[6], locale));
  }

  /** "Dnes" / "Zajtra" above the date in the agenda */
  protected relative(key: string): string {
    const c = this.t().calendar;
    const today = this.today();
    return !today ? '' : key === today ? c.today : key === addDays(today, 1) ? c.tomorrow : '';
  }

  protected longDay(key: string): string {
    return longDay(key, this.i18n.locale());
  }

  /** for screen readers on a bar: the whole time span (to the exact end) and whether it is running now */
  protected spoken(item: Occurrence): string {
    const locale = this.i18n.locale();
    const first = dayKey(new Date(item.start));
    const last = item.end ? dayKey(new Date(item.end)) : first;
    const start = `${longDay(first, locale)} ${this.clock(item.start)}`;
    const end = item.end
      ? ` – ${first === last ? '' : longDay(last, locale) + ' '}${this.clock(item.end)}`
      : '';
    return `${start}${end}${this.running(item) ? `, ${this.t().calendar.running}` : ''}`;
  }

  /** agenda line under the name: "od po 5. 10. · do ne 11. 10. 02:00 · každých 8 týždňov" */
  protected details(item: Occurrence, day: string): string {
    const c = this.t().calendar;
    const locale = this.i18n.locale();
    const first = dayKey(new Date(item.start));
    const parts = [];
    if (first < day) parts.push(c.since.replace('{date}', shortDay(first, locale)));
    if (item.end) {
      const end = new Date(item.end);
      const last = dayKey(end);
      parts.push(
        c.until.replace(
          '{date}',
          `${first === last ? '' : shortDay(last, locale) + ' '}${this.clock(item.end)}`,
        ),
      );
    }
    const texts = this.t().reminders;
    parts.push(item.irregular ? texts.repeat.irregular : repeatLabel(item.repeat_days, texts));
    return parts.join(' · ');
  }

  protected zoneNote(): string {
    return this.t().calendar.zone.replace('{zone}', this.zone() || 'UTC');
  }

  private inMonth(items: Occurrence[]): Occurrence[] {
    const month = this.month();
    if (!month) return [];
    const { first, last } = monthBounds(month);
    return items.filter((o) => {
      const days = daysOf(o);
      return days.last >= first && days.first <= last;
    });
  }

  /** a run comes back to its own month (?on=), an irregular event without a date only by its id */
  private returnPath(item: PublicEvent): string {
    return this.i18n.path('calendar') + eventLink(item, new Date());
  }
}

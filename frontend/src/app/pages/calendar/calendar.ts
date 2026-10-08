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
import { EventsApi, Occurrence, PublicEvent, eventName } from '../../core/events-api';
import { I18n } from '../../core/i18n/i18n';
import { RemindersApi } from '../../core/reminders-api';
import { Icon } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';
import { repeatLabel } from '../account/reminders/format';
import { EventDialog, RemindState } from './event-dialog';
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

/**
 * /kalendar – kingdom events in a month grid (an agenda list on phones), in the visitor's time and in UTC.
 * The prerendered page is only the shell: the month depends on today, so it is built in the browser. Clicking an event
 * opens its details; a signed-in player sets the reminders right there.
 */
@Component({
  selector: 'app-calendar',
  imports: [Icon, PageHeader, EventDialog],
  templateUrl: './calendar.html',
  styleUrl: './calendar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Calendar {
  /** ?event=<id> – back from the Discord login started in that event's dialog, which opens again */
  readonly event = input<string>();

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
  /** the grid and a day more on each side – the server counts days in Bratislava, the visitor may be elsewhere */
  private readonly data = inject(EventsApi).calendar(() => {
    const rows = this.weekRows();
    return rows.length ? { from: addDays(rows[0][0], -1), to: addDays(rows.at(-1)![6], 1) } : null;
  });
  protected readonly loaded = computed(() => this.data.hasValue() && !this.data.isLoading());
  protected readonly failed = computed(() => !!this.data.error());
  private readonly all = computed(() => (this.data.hasValue() ? this.data.value().occurrences : []));
  /** the same daily event on every day says little – listed once above the grid */
  protected readonly daily = computed(() => {
    const seen = new Set<number>();
    return this.inMonth(this.all().filter(isDaily)).filter((o) => !seen.has(o.id) && seen.add(o.id));
  });
  private readonly dated = computed(() => this.all().filter((o) => !isDaily(o)));
  protected readonly weeks = computed<Week[]>(() => layoutWeeks(this.weekRows(), this.dated()));
  protected readonly agenda = computed(() => {
    const month = this.month();
    return month ? agenda(this.dated(), month, this.today() ?? undefined) : [];
  });
  protected readonly waiting = computed(() => (this.data.hasValue() ? this.data.value().irregular_waiting : []));
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
    if (!this.auth.user()) return { kind: 'login', loginUrl: this.auth.loginUrl(this.returnPath(item)) };
    if (this.reminders.error()) return { kind: 'error' };
    if (!this.reminders.hasValue()) return { kind: 'loading' };
    const s = this.reminders.value();
    const discord = s.discord_available && s.discord;
    const push = !!s.push_key && s.push_devices > 0;
    return {
      kind: 'player',
      // missing = the event will not run again (a finished one-off)
      event: s.events.find((e) => e.id === item.id) ?? null,
      noChannel: (s.discord_available || !!s.push_key) && !discord && !push,
    };
  });
  /** the event that opened the dialog gets the focus back */
  private trigger: HTMLElement | null = null;

  constructor() {
    afterNextRender(() => {
      const tick = () => this.now.set(new Date());
      tick();
      this.month.set(monthOf(dayKey(this.now()!)));
      this.zone.set(Intl.DateTimeFormat().resolvedOptions().timeZone ?? '');
      // "Prebieha" and today move on by themselves
      const timer = setInterval(tick, 60_000);
      this.destroyRef.onDestroy(() => clearInterval(timer));
    });

    // back from the login started in a dialog: open the same event again, then drop ?event= from the address
    effect(() => {
      const id = Number(this.event());
      if (!id || !this.loaded()) return;
      untracked(() => {
        const now = Date.now();
        const runs = this.all().filter((o) => o.id === id);
        const item =
          runs.find((o) => Date.parse(o.end ?? o.start) > now) ??
          this.waiting().find((e) => e.id === id) ??
          runs.at(-1);
        if (item) this.selected.set(item);
        void this.router.navigate([], {
          queryParams: { event: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
      });
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
    this.trigger?.focus();
    this.trigger = null;
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
    const end = item.end ? ` – ${first === last ? '' : longDay(last, locale) + ' '}${this.clock(item.end)}` : '';
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
        c.until.replace('{date}', `${first === last ? '' : shortDay(last, locale) + ' '}${this.clock(item.end)}`),
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

  private returnPath(item: PublicEvent): string {
    return `${this.i18n.path('calendar')}?event=${item.id}`;
  }
}

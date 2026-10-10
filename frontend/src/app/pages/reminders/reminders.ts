import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Occurrence, PublicEvent } from '../../core/events-api';
import { I18n } from '../../core/i18n/i18n';
import { KingdomApi } from '../../core/api';
import { LastDelivery, ReminderEvent, RemindersApi, TestResult } from '../../core/reminders-api';
import { EventIcon } from '../../shared/event-icon';
import { showsClock } from '../../shared/event-time';
import { Icon } from '../../shared/icon';
import { fold } from '../../shared/search';
import { EventDialog, RemindState } from '../calendar/event-dialog';
import { EVENING_BEFORE, duration, plural, repeatLabel } from './format';

type Filter = 'all' | 'regular' | 'irregular';

/** events shown in "Všetky eventy" before "Zobraziť ďalšie" */
const PAGE = 12;

/**
 * The reminders panel of /pripomienky (signed-in players only, so it only ever renders in the browser): the switch
 * for the bot's Discord messages, "Moje pripomienky" – one short block per event the player is reminded of – and all
 * events as tiles with search and a filter. The times are set in the same dialog as in the calendar.
 */
@Component({
  selector: 'app-reminders',
  imports: [Icon, EventIcon, RouterLink, EventDialog],
  templateUrl: './reminders.html',
  styleUrl: './reminders.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Reminders {
  private readonly api = inject(RemindersApi);
  private readonly kingdom = inject(KingdomApi);
  protected readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.t().reminders);

  protected readonly data = this.api.settings();
  protected readonly settings = computed(() => (this.data.hasValue() ? this.data.value() : null));
  protected readonly discord = linkedSignal(() => this.settings()?.discord ?? false);
  protected readonly discordState = signal<'saved' | 'failed' | null>(null);
  /** the player's times per event, kept current after every change (the overview and the tiles follow) */
  private readonly chosen = linkedSignal(
    () => new Map((this.settings()?.events ?? []).map((event) => [event.id, event.offsets])),
  );
  protected readonly events = computed<ReminderEvent[]>(() =>
    (this.settings()?.events ?? []).map((event) => ({
      ...event,
      offsets: this.chosen().get(event.id) ?? null,
    })),
  );
  /** "Moje pripomienky": the events the player is reminded of */
  protected readonly mine = computed(() => this.events().filter((event) => event.offsets?.length));
  protected readonly query = signal('');
  protected readonly filter = signal<Filter>('all');
  protected readonly filters: Filter[] = ['all', 'regular', 'irregular'];
  /** irregular events first (Gether: they are the ones to watch), each group in the server's order (soonest first) */
  protected readonly matching = computed(() => {
    const query = fold(this.query());
    const filter = this.filter();
    const found = this.events().filter(
      (event) =>
        (filter === 'all' || (filter === 'irregular') === event.irregular) &&
        (!query || fold(`${event.name_sk} ${event.name_cs}`).includes(query)),
    );
    return [...found.filter((event) => event.irregular), ...found.filter((event) => !event.irregular)];
  });
  /** a new search or filter starts at the first page again */
  protected readonly limit = linkedSignal({
    source: () => [this.query(), this.filter()],
    computation: () => PAGE,
  });
  protected readonly shown = computed(() => this.matching().slice(0, this.limit()));
  /** "Zrušiť" in the overview: the events being stopped, and whether the last try failed */
  protected readonly stopping = signal<ReadonlySet<number>>(new Set());
  protected readonly stopFailed = signal(false);

  // ---------------------------------------------------------------- the dialog with the times

  private readonly selectedId = signal<number | null>(null);
  protected readonly selected = computed(
    () => this.events().find((e) => e.id === this.selectedId()) ?? null,
  );
  /** the event as the calendar's dialog shows it: the next start, or "ďalší termín oznámime" */
  protected readonly dialogItem = computed<PublicEvent | Occurrence | null>(() => {
    const event = this.selected();
    if (!event) return null;
    const base = {
      id: event.id,
      name_sk: event.name_sk,
      name_cs: event.name_cs,
      icon: event.icon,
      offered: event.offered,
      guide: null,
    };
    if (!event.next_start) return base;
    return {
      ...base,
      start: event.next_start,
      end: null,
      repeat_days: event.repeat_days,
      irregular: event.irregular,
    };
  });
  protected readonly remind = computed<RemindState>(() => ({
    kind: 'player',
    event: this.selected(),
    noChannel: this.noChannel(),
  }));
  protected readonly now = signal(new Date());
  /** the tile or line that opened the dialog gets the focus back */
  private trigger: HTMLElement | null = null;

  /** language the messages are written in – follows the site's language */
  private readonly savedLang = linkedSignal(() => this.settings()?.lang ?? null);

  /** the bot is set up on the server, but the player switched its messages off – no reminder reaches them */
  protected readonly noChannel = computed(() => !!this.settings()?.discord_available && !this.discord());

  // ---------------------------------------------------------------- can the bot reach the player?

  /** "Pripojiť sa na Discord" next to "the bot cannot write to you" – the invite from the admin, hidden without it */
  protected readonly invite = computed(() => this.kingdom.links().discord ?? null);
  protected readonly testing = signal(false);
  protected readonly testResult = signal<TestResult | null>(null);
  /** a test message reached the player during this visit: the older failure is hidden here, although the server
   *  reports it until the next real reminder arrives (nothing about the test is stored) */
  private readonly reached = signal(false);
  /** the newest reminder did not arrive – only while the player still wants the bot's messages */
  protected readonly lastFailed = computed<LastDelivery | null>(() => {
    const s = this.settings();
    const last = s?.last_delivery;
    if (!last || last.ok || !s.discord_available || !this.discord() || this.reached()) return null;
    return last;
  });

  constructor() {
    effect(() => {
      const saved = this.savedLang();
      const lang = this.i18n.lang();
      if (saved && saved !== lang) {
        this.savedLang.set(lang);
        // quiet: on failure the next visit tries again
        this.api.update({ lang }).catch(() => undefined);
      }
    });
  }

  // ---------------------------------------------------------------- texts

  protected name(event: ReminderEvent): string {
    return (this.i18n.lang() === 'cs' && event.name_cs) || event.name_sk;
  }

  protected repeat(event: ReminderEvent): string {
    return event.irregular ? this.t().repeat.irregular : repeatLabel(event.repeat_days, this.t());
  }

  /** "pi 16. 10." – with "20:00 · UTC 18:00" in the player's own time zone only for a short irregular event
   *  (the year only when it is not this one) */
  protected when(event: ReminderEvent): string {
    if (!event.next_start && event.running_until) {
      // like the calendar: "Prebieha · do po 12. 10."
      const c = this.i18n.t().calendar;
      const end = new Date(event.running_until);
      const weekday = new Intl.DateTimeFormat(this.i18n.locale(), { weekday: 'short' }).format(end);
      return `${c.running} · ${c.until.replace('{date}', `${weekday} ${end.getDate()}. ${end.getMonth() + 1}.`)}`;
    }
    if (!event.next_start) return this.t().noDate;
    const start = new Date(event.next_start);
    const locale = this.i18n.locale();
    const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(start);
    const year = start.getFullYear() === new Date().getFullYear() ? '' : ` ${start.getFullYear()}`;
    const clock = (timeZone?: string) =>
      new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone }).format(
        start,
      );
    const day = `${weekday} ${start.getDate()}. ${start.getMonth() + 1}.${year}`;
    if (!showsClock(event.irregular, event.duration_minutes)) return day;
    return `${day} ${clock()} · UTC ${clock('UTC')}`;
  }

  /** "1 deň 6 h · 1 h vopred", "10 min vopred · pri začiatku", "deň vopred o 18:00 · 3 h vopred" */
  protected times(event: ReminderEvent): string {
    const t = this.t();
    const offsets = event.offsets ?? [];
    const before = offsets.filter((m) => m > 0).map((m) => duration(m, t));
    const parts = before.length ? [t.before.replace('{time}', before.join(' · '))] : [];
    if (offsets.includes(EVENING_BEFORE)) parts.unshift(t.evening);
    if (offsets.includes(0)) parts.push(t.atStart);
    return parts.join(' · ');
  }

  protected count(event: ReminderEvent): string {
    return plural(event.offsets?.length ?? 0, this.t().count);
  }

  /** "Posledná pripomienka ti neprišla (7. 10. 20:00)." – in the player's own time zone */
  protected failedTitle(last: LastDelivery): string {
    const at = new Date(last.at);
    const clock = new Intl.DateTimeFormat(this.i18n.locale(), {
      hour: '2-digit',
      minute: '2-digit',
    }).format(at);
    return this.t().lastFailed.title.replace(
      '{date}',
      `${at.getDate()}. ${at.getMonth() + 1}. ${clock}`, // never broken across lines
    );
  }

  // ---------------------------------------------------------------- actions

  protected openEvent(event: ReminderEvent, click: Event): void {
    this.trigger = click.currentTarget as HTMLElement;
    this.now.set(new Date());
    this.selectedId.set(event.id);
  }

  protected closeEvent(): void {
    this.selectedId.set(null);
    this.trigger?.focus();
    this.trigger = null;
  }

  protected changed(id: number, offsets: number[] | null): void {
    this.chosen.update((chosen) => new Map(chosen).set(id, offsets));
  }

  /** "Zrušiť" in the overview: no more reminders of this event */
  protected async stop(event: ReminderEvent): Promise<void> {
    this.stopping.update((ids) => new Set(ids).add(event.id));
    this.stopFailed.set(false);
    try {
      await this.api.setOffsets(event.id, []);
      this.changed(event.id, null);
    } catch {
      this.stopFailed.set(true);
    } finally {
      this.stopping.update((ids) => {
        const next = new Set(ids);
        next.delete(event.id);
        return next;
      });
    }
  }

  protected more(): void {
    this.limit.update((limit) => limit + PAGE);
  }

  /** "Poslať skúšobnú správu": the answer is announced under the button */
  protected async sendTest(): Promise<void> {
    // aria-disabled while sending: the button keeps the keyboard focus
    if (this.testing()) return;
    this.testing.set(true);
    this.testResult.set(null);
    const result = await this.api.testDm();
    if (result === 'ok') this.reached.set(true);
    this.testResult.set(result);
    this.testing.set(false);
  }

  protected async setDiscord(on: boolean): Promise<void> {
    this.discord.set(on);
    this.discordState.set(null);
    try {
      await this.api.update({ discord: on });
      this.discordState.set('saved');
    } catch {
      this.discord.set(!on);
      this.discordState.set('failed');
    }
  }
}

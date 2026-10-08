import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Occurrence, PublicEvent } from '../../../core/events-api';
import { I18n } from '../../../core/i18n/i18n';
import { ReminderEvent, RemindersApi } from '../../../core/reminders-api';
import { EventIcon } from '../../../shared/event-icon';
import { Icon } from '../../../shared/icon';
import { EventDialog, RemindState } from '../../calendar/event-dialog';
import { duration, plural, repeatLabel } from './format';
import { WebPush } from './web-push';

/** This browser: checking / no Push API / blocked by the player / off / on */
type PushState = 'checking' | 'unsupported' | 'denied' | 'off' | 'on';
type Filter = 'all' | 'regular' | 'irregular';

/** events shown in "Všetky eventy" before "Zobraziť ďalšie" */
const PAGE = 12;

/** lower case without diacritics: "Pěchota" and "pechota" find the same event */
export function plain(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/**
 * "Pripomienky eventov" on /ucet (signed-in players only, so it only ever renders in the browser): where the
 * reminders go (Discord DM, notifications in this browser), "Moje pripomienky" – one short line per event the player
 * is reminded of – and all events as tiles with search and a filter. The times are set in the same dialog as in the
 * calendar.
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
  private readonly webPush = inject(WebPush);
  protected readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.t().reminders);

  protected readonly data = this.api.settings();
  protected readonly settings = computed(() => (this.data.hasValue() ? this.data.value() : null));
  protected readonly discord = linkedSignal(() => this.settings()?.discord ?? false);
  protected readonly devices = linkedSignal(() => this.settings()?.push_devices ?? 0);
  protected readonly push = signal<PushState>('checking');
  protected readonly pushBusy = signal(false);
  protected readonly pushFailed = signal(false);
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
    const query = plain(this.query());
    const filter = this.filter();
    const found = this.events().filter(
      (event) =>
        (filter === 'all' || (filter === 'irregular') === event.irregular) &&
        (!query || plain(`${event.name_sk} ${event.name_cs}`).includes(query)),
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

  protected readonly pushNote = computed(() => {
    const t = this.t();
    if (!this.settings()?.push_key) return t.off;
    if (this.pushFailed()) return t.pushError;
    return {
      checking: t.pushHint,
      unsupported: t.pushUnsupported,
      denied: t.pushDenied,
      off: t.pushHint,
      on: t.pushOn,
    }[this.push()];
  });

  /** at least one channel exists on the server, but none of them reaches the player */
  protected readonly noChannel = computed(() => {
    const s = this.settings();
    if (!s || (!s.discord_available && !s.push_key) || this.push() === 'checking') return false;
    return !(s.discord_available && this.discord()) && this.devices() === 0;
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
    effect(() => {
      const key = this.settings()?.push_key;
      if (key !== undefined) untracked(() => void this.checkPush(key));
    });
  }

  // ---------------------------------------------------------------- texts

  protected name(event: ReminderEvent): string {
    return (this.i18n.lang() === 'cs' && event.name_cs) || event.name_sk;
  }

  protected repeat(event: ReminderEvent): string {
    return event.irregular ? this.t().repeat.irregular : repeatLabel(event.repeat_days, this.t());
  }

  /** "pi 16. 10. 02:00 · UTC 00:00" in the player's own time zone (the year only when it is not this one) */
  protected when(event: ReminderEvent): string {
    if (!event.next_start) return this.t().noDate;
    const start = new Date(event.next_start);
    const locale = this.i18n.locale();
    const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(start);
    const year = start.getFullYear() === new Date().getFullYear() ? '' : ` ${start.getFullYear()}`;
    const clock = (timeZone?: string) =>
      new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone }).format(
        start,
      );
    return `${weekday} ${start.getDate()}. ${start.getMonth() + 1}.${year} ${clock()} · UTC ${clock('UTC')}`;
  }

  /** "1 deň 6 h · 1 h vopred", "10 min vopred · pri začiatku" */
  protected times(event: ReminderEvent): string {
    const t = this.t();
    const offsets = event.offsets ?? [];
    const before = offsets.filter((m) => m > 0).map((m) => duration(m, t));
    const parts = before.length ? [t.before.replace('{time}', before.join(' · '))] : [];
    if (offsets.includes(0)) parts.push(t.atStart);
    return parts.join(' · ');
  }

  protected count(event: ReminderEvent): string {
    return plural(event.offsets?.length ?? 0, this.t().count);
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

  protected async enablePush(): Promise<void> {
    const key = this.settings()?.push_key;
    if (!key) return;
    this.pushBusy.set(true);
    this.pushFailed.set(false);
    try {
      const subscription = await this.webPush.subscribe(key);
      this.devices.set(await this.api.addDevice(subscription.toJSON()));
      this.push.set('on');
    } catch {
      if (this.webPush.denied()) this.push.set('denied');
      else this.pushFailed.set(true);
    } finally {
      this.pushBusy.set(false);
    }
  }

  protected async disablePush(): Promise<void> {
    this.pushBusy.set(true);
    this.pushFailed.set(false);
    try {
      const endpoint = await this.webPush.unsubscribe();
      this.push.set('off');
      if (endpoint) this.devices.set(await this.api.removeDevice(endpoint));
    } catch {
      // a cancelled subscription fails at the push service, and the server then deletes it by itself
    } finally {
      this.pushBusy.set(false);
    }
  }

  /** Is this browser subscribed? A subscription found is sent again, so the server knows it belongs to this
   * player (another player may have used the browser before, or the browser renewed its keys). */
  private async checkPush(key: string): Promise<void> {
    if (!key) return this.push.set('off'); // not set up on the server
    if (!this.webPush.supported()) return this.push.set('unsupported');
    if (this.webPush.denied()) return this.push.set('denied');
    try {
      const subscription = await this.webPush.current(key);
      if (subscription) this.devices.set(await this.api.addDevice(subscription.toJSON()));
      this.push.set(subscription ? 'on' : 'off');
    } catch {
      this.push.set('off');
    }
  }
}

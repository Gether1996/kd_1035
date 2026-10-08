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
import { I18n } from '../../../core/i18n/i18n';
import { ReminderEvent, RemindersApi } from '../../../core/reminders-api';
import { Icon } from '../../../shared/icon';
import { EventRow } from './event-row';
import { WebPush } from './web-push';

/** This browser: checking / no Push API / blocked by the player / off / on */
type PushState = 'checking' | 'unsupported' | 'denied' | 'off' | 'on';
type Filter = 'all' | 'regular' | 'irregular';

/** events shown in "Všetky eventy" before "Zobraziť ďalšie" */
const PAGE = 8;

/** lower case without diacritics: "Pěchota" and "pechota" find the same event */
export function plain(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

/**
 * "Pripomienky eventov" on /ucet (signed-in players only, so it only ever renders in the browser): where the
 * reminders go (Discord DM, notifications in this browser), an overview of the events the player is reminded of and
 * all events – compact rows with search and a filter, so a long list stays easy to use.
 */
@Component({
  selector: 'app-reminders',
  imports: [EventRow, Icon, RouterLink],
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
  /** the player's times per event, kept current from the rows (one change shows in both lists) */
  private readonly chosen = linkedSignal(
    () => new Map((this.settings()?.events ?? []).map((event) => [event.id, event.offsets])),
  );
  protected readonly events = computed<ReminderEvent[]>(() =>
    (this.settings()?.events ?? []).map((event) => ({ ...event, offsets: this.chosen().get(event.id) ?? null })),
  );
  /** "Moje pripomienky": the events the player is reminded of */
  protected readonly mine = computed(() => this.events().filter((event) => event.offsets?.length));
  protected readonly query = signal('');
  protected readonly filter = signal<Filter>('all');
  protected readonly filters: Filter[] = ['all', 'regular', 'irregular'];
  protected readonly matching = computed(() => {
    const query = plain(this.query());
    const filter = this.filter();
    return this.events().filter(
      (event) =>
        (filter === 'all' || (filter === 'irregular') === event.irregular) &&
        (!query || plain(`${event.name_sk} ${event.name_cs}`).includes(query)),
    );
  });
  /** a new search or filter starts at the first page again */
  protected readonly limit = linkedSignal({ source: () => [this.query(), this.filter()], computation: () => PAGE });
  protected readonly shown = computed(() => this.matching().slice(0, this.limit()));
  /** the one open row: 'mine-7' or 'all-7' */
  protected readonly open = signal<string | null>(null);

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

  protected toggle(key: string): void {
    this.open.update((open) => (open === key ? null : key));
  }

  protected changed(id: number, offsets: number[] | null): void {
    this.chosen.update((chosen) => new Map(chosen).set(id, offsets));
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

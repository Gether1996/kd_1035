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
import { I18n } from '../../../core/i18n/i18n';
import { RemindersApi } from '../../../core/reminders-api';
import { Icon } from '../../../shared/icon';
import { EventRow } from './event-row';
import { WebPush } from './web-push';

/** This browser: checking / no Push API / blocked by the player / off / on */
type PushState = 'checking' | 'unsupported' | 'denied' | 'off' | 'on';

/**
 * "Pripomienky eventov" on /ucet (signed-in players only, so it only ever renders in the browser): where the
 * reminders go (Discord DM, notifications in this browser) and which events to be reminded of.
 */
@Component({
  selector: 'app-reminders',
  imports: [EventRow, Icon],
  templateUrl: './reminders.html',
  styleUrl: './reminders.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Reminders {
  private readonly api = inject(RemindersApi);
  private readonly webPush = inject(WebPush);
  private readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.t().reminders);

  protected readonly data = this.api.settings();
  protected readonly settings = computed(() => (this.data.hasValue() ? this.data.value() : null));
  protected readonly discord = linkedSignal(() => this.settings()?.discord ?? false);
  protected readonly devices = linkedSignal(() => this.settings()?.push_devices ?? 0);
  protected readonly push = signal<PushState>('checking');
  protected readonly pushBusy = signal(false);
  protected readonly pushFailed = signal(false);
  protected readonly discordState = signal<'saved' | 'failed' | null>(null);
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

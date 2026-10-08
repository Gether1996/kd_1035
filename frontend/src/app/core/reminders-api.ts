import { isPlatformBrowser } from '@angular/common';
import { HttpClient, httpResource } from '@angular/common/http';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Lang } from './i18n/i18n';

export interface ReminderEvent {
  id: number;
  name_sk: string;
  /** '' = the Slovak name is shown */
  name_cs: string;
  /** next start, ISO 8601 in UTC */
  next_start: string;
  /** 0 = one-off */
  repeat_days: number;
  /** minutes before the start that leadership offers */
  offered: number[];
  /** the player's choice (largest first), null = not reminded */
  offsets: number[] | null;
}

export interface ReminderSettings {
  /** private Discord message from the bot */
  discord: boolean;
  /** false while the bot is not set up on the server */
  discord_available: boolean;
  /** VAPID public key for the browser, '' while web push is not set up */
  push_key: string;
  /** browsers of this player with notifications on */
  push_devices: number;
  lang: Lang;
  /** active events with another start, soonest first */
  events: ReminderEvent[];
}

const REMINDERS_URL = '/api/me/reminders/';
const PUSH_URL = '/api/me/push/';
export const MAX_REMINDERS = 5;
export const MAX_MINUTES = 7 * 24 * 60;

/**
 * The signed-in player's event reminders (/api/me/…). Session + CSRF like Auth; only called in the browser.
 */
@Injectable({ providedIn: 'root' })
export class RemindersApi {
  private readonly http = inject(HttpClient);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Fresh settings for the component that asks (must run in an injection context, e.g. a field initializer). */
  settings() {
    return httpResource<ReminderSettings>(() => (this.isBrowser ? REMINDERS_URL : undefined));
  }

  /** Remind of the event `offsets` minutes before each start; an empty list stops the reminders. */
  async setOffsets(eventId: number, offsets: number[]): Promise<number[] | null> {
    const url = `${REMINDERS_URL}${eventId}/`;
    if (!offsets.length) {
      await firstValueFrom(this.http.delete(url));
      return null;
    }
    return (await firstValueFrom(this.http.put<ReminderEvent>(url, { offsets }))).offsets;
  }

  /** Discord messages on/off, language of the messages (the site's language). */
  async update(changes: { discord?: boolean; lang?: Lang }): Promise<void> {
    await firstValueFrom(this.http.patch(REMINDERS_URL, changes));
  }

  /** Stores this browser's push subscription; resolves with the player's number of browsers. */
  async addDevice(subscription: PushSubscriptionJSON): Promise<number> {
    return (await firstValueFrom(this.http.post<{ push_devices: number }>(PUSH_URL, subscription))).push_devices;
  }

  async removeDevice(endpoint: string): Promise<number> {
    const answer = this.http.delete<{ push_devices: number }>(PUSH_URL, { body: { endpoint } });
    return (await firstValueFrom(answer)).push_devices;
  }
}

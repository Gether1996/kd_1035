import { HttpClient, httpResource } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** A level of the yellow cards: the n-th card in a row gets the n-th one, past the last one the last one again */
export interface ViolationLevel {
  name: string;
  penalty: string;
  /** how long the penalty lasts from the card's day; 0 = no time */
  days: number;
}

export interface ViolationRules {
  /** a card within this many days of the one before goes a level up; after it without one the player is clean */
  window_days: number;
  /** older cards are deleted (privacy page) */
  keep_days: number;
  levels: ViolationLevel[];
}

export interface ViolationCard {
  id: number;
  /** YYYY-MM-DD */
  day: string;
  reason: string;
  /** counted by the server from the cards and the rules, 1 = the first level */
  level: number;
  added_by: string;
  created_at: string;
}

export interface ViolationPlayer {
  id: number;
  name: string;
  avatar_url: string;
  /** today: the level of the last card while it is valid, 0 = clean */
  level: number;
  active_until: string | null;
  penalty_until: string | null;
  /** the newest first */
  cards: ViolationCard[];
}

export interface ViolationData {
  rules: ViolationRules;
  players: ViolationPlayer[];
  /** the superadmin changes the rules */
  edit_rules: boolean;
}

const URL = '/api/violations/';

/** Yellow cards for rule violations on /priestupky (Gether 18. 11. 2026). Session + CSRF, only in the browser. */
@Injectable({ providedIn: 'root' })
export class ViolationsApi {
  private readonly http = inject(HttpClient);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  data(when: () => boolean) {
    return httpResource<ViolationData>(() => (this.isBrowser && when() ? URL : undefined));
  }

  add(player: number, day: string, reason: string): Promise<ViolationPlayer> {
    return firstValueFrom(this.http.post<ViolationPlayer>(URL, { player, day, reason }));
  }

  remove(id: number): Promise<ViolationPlayer> {
    return firstValueFrom(this.http.delete<ViolationPlayer>(`${URL}${id}/`));
  }

  saveRules(rules: ViolationRules): Promise<ViolationRules> {
    return firstValueFrom(this.http.put<ViolationRules>(`${URL}settings/`, rules));
  }
}

/**
 * The level the next card on `day` would get – the server's count (accounts/violations.py) for the preview of the form:
 * a card within `window` days of the one before goes a level up, a longer gap starts again.
 */
export function nextLevel(cards: ViolationCard[], day: string, window: number): number {
  const days = cards.map((c) => c.day).filter((d) => d <= day).sort();
  let level = 0;
  let before: string | null = null;
  for (const d of [...days, day]) {
    level = before !== null && daysBetween(before, d) <= window ? level + 1 : 1;
    before = d;
  }
  return level;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

/** the n-th level, past the last one the last one again */
export function levelOf(levels: ViolationLevel[], n: number): ViolationLevel | null {
  return n > 0 && levels.length ? levels[Math.min(n, levels.length) - 1] : null;
}

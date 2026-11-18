import { HttpClient, httpResource } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** A strike: the n-th violation in a row gets the n-th one, past the last one the last one again */
export interface ViolationLevel {
  name: string;
  penalty: string;
  /** how long the penalty lasts from the violation's day; 0 = no time (a zero) */
  days: number;
}

export interface ViolationRules {
  /** after the penalty ended and this many days without a violation the player is clean again */
  reset_days: number;
  /** older violations are deleted (privacy page) */
  keep_days: number;
  /** shown to every approved player on the Prehľad tab */
  description: string;
  levels: ViolationLevel[];
}

export interface ViolationCard {
  id: number;
  /** YYYY-MM-DD */
  day: string;
  reason: string;
  /** the strike counted by the server from the violations and the rules, 1 = the first */
  level: number;
  added_by: string;
  created_at: string;
}

export interface ViolationPlayer {
  id: number;
  name: string;
  avatar_url: string;
  /** today: the strike of the last violation until the reset, 0 = clean */
  level: number;
  /** the last day of the running penalty – maybe of an earlier strike (a zero during a kick) */
  penalty_until: string | null;
  /** its text */
  penalty: string;
  /** the first clean day */
  reset_on: string | null;
  /** the newest first */
  cards: ViolationCard[];
}

export interface ViolationData {
  rules: ViolationRules;
  players: ViolationPlayer[];
  /** the superadmin changes the rules */
  edit_rules: boolean;
}

export type BoardPlayer = Omit<ViolationPlayer, 'cards'>;

/** the Prehľad tab: what every approved player sees – no reasons */
export interface ViolationBoard {
  description: string;
  reset_days: number;
  levels: ViolationLevel[];
  players: BoardPlayer[];
  /** the Správa tab is open to this player too */
  manage: boolean;
}

const URL = '/api/violations/';

/** Strikes for rule violations on /priestupky (Gether 18. 11. 2026). Session + CSRF, only in the browser. */
@Injectable({ providedIn: 'root' })
export class ViolationsApi {
  private readonly http = inject(HttpClient);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  data(when: () => boolean) {
    return httpResource<ViolationData>(() => (this.isBrowser && when() ? URL : undefined));
  }

  board(when: () => boolean) {
    return httpResource<ViolationBoard>(() => (this.isBrowser && when() ? `${URL}board/` : undefined));
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

/** the n-th strike, past the last one the last one again */
export function levelOf(levels: ViolationLevel[], n: number): ViolationLevel | null {
  return n > 0 && levels.length ? levels[Math.min(n, levels.length) - 1] : null;
}

/** YYYY-MM-DD + days */
export function addDays(day: string, days: number): string {
  const date = new Date(day + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * The strike the next violation on `day` would get – the server's count (accounts/violations.py) for the preview of the
 * form: before the penalty of the one before ended + reset_days the next strike, later the first again.
 */
export function nextLevel(cards: ViolationCard[], day: string, rules: Pick<ViolationRules, 'levels' | 'reset_days'>): number {
  const days = cards.map((c) => c.day).filter((d) => d <= day).sort();
  let level = 0;
  // the latest end of the penalties so far – a shorter later one does not cut a running one short
  let ends: string | null = null;
  for (const d of [...days, day]) {
    level = ends !== null && d <= addDays(ends, rules.reset_days) ? level + 1 : 1;
    const end = addDays(d, levelOf(rules.levels, level)?.days ?? 0);
    if (ends === null || end > (ends as string)) ends = end;
  }
  return level;
}

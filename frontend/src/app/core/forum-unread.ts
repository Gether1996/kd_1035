import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, effect, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter, firstValueFrom } from 'rxjs';
import { Auth } from './auth';

/** what this browser saw of a forum thread: the time of its last message and how many there were (-1: not known) */
export interface ForumSeen {
  at: string;
  n: number;
}

/** a thread as far as "new messages" go */
export interface ForumActivity {
  id: number;
  last_post_at: string;
  mine: boolean;
}

/** when this browser last read each thread – the forum page writes it, the account menu counts from it */
export const FORUM_SEEN_KEY = 'kd1035.forum.seen';
/** the account menu asks again this often while the tab is visible */
const REFRESH_MS = 60_000;

export function readForumSeen(): Record<string, ForumSeen> {
  try {
    const value = JSON.parse(localStorage.getItem(FORUM_SEEN_KEY) ?? '{}');
    if (!value || typeof value !== 'object') return {};
    // before v1.46.0 only the time was kept
    return Object.fromEntries(
      Object.entries(value).map(([id, v]) => [id, typeof v === 'string' ? { at: v, n: -1 } : (v as ForumSeen)]),
    );
  } catch {
    return {};
  }
}

/** messages since this browser last read the thread – also my own thread once someone answered */
export function forumUnread(thread: ForumActivity, seen: Record<string, ForumSeen>): boolean {
  const read = seen[thread.id];
  return read ? read.at < thread.last_post_at : !thread.mine;
}

/**
 * How many forum threads have messages this browser has not read – the number next to "Fórum" in the account menu
 * (Gether 25. 10. 2026). Signed-in players only, in the browser only; asked at sign-in, every REFRESH_MS while the tab
 * is visible and when a page opens after that; counted again whenever the forum page marks a thread read.
 */
@Injectable({ providedIn: 'root' })
export class ForumUnreadCount {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(Auth);
  private readonly threads = signal<ForumActivity[]>([]);
  private asked = 0;
  readonly count = signal(0);

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    effect(() => {
      if (this.auth.user()) void this.refresh();
      else this.count.set(0);
    });
    inject(Router)
      .events.pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => (Date.now() - this.asked > REFRESH_MS ? void this.refresh() : this.recount()));
    setInterval(() => {
      if (this.auth.user() && document.visibilityState === 'visible') void this.refresh();
    }, REFRESH_MS);
    // another tab read a thread
    addEventListener('storage', (e) => e.key === FORUM_SEEN_KEY && this.recount());
  }

  async refresh(): Promise<void> {
    this.asked = Date.now();
    try {
      const res = await firstValueFrom(
        this.http.get<{ threads: ForumActivity[] }>('/api/forum/', { params: { brief: '1' } }),
      );
      this.threads.set(res.threads);
      this.recount();
    } catch {
      // the forum is down – no number rather than a wrong one
    }
  }

  recount(): void {
    const seen = readForumSeen();
    this.count.set(this.threads().filter((t) => forumUnread(t, seen)).length);
  }
}

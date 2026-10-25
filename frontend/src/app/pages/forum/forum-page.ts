import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom, map } from 'rxjs';
import { Auth } from '../../core/auth';
import { I18n } from '../../core/i18n/i18n';
import { KINGDOM_ZONE } from '../../core/kingdom-zone';
import { Seo } from '../../core/seo';
import { Icon } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';
import { plural } from '../reminders/format';

/** a thread as /api/forum/ sends it */
export interface ForumThread {
  id: number;
  title: string;
  created_at: string;
  last_post_at: string;
  posts: number;
  /** started in this browser */
  mine: boolean;
}

export interface ForumPost {
  id: number;
  body: string;
  at: string;
  /** "Anonym 2" – the writer's number in the thread */
  alias: number;
  mine: boolean;
}

type ErrorKey = 'empty' | 'invalid' | 'cooldown' | 'links' | 'busy' | 'failed';

const API = '/api/forum/';
/** the open room asks for new messages this often (only while the tab is visible) */
const POLL_MS = 10_000;
/** when this browser last opened each thread – the "nové" badge in the list; a per-viewer convenience only */
const SEEN_KEY = 'kd1035.forum.seen';

/**
 * /forum – the kingdom's anonymous room (Gether 25. 10. 2026: "spoločná inkognito roomka … ako na WhatsAppe alebo
 * Discorde, nič komplikované"): the threads, and a thread (?vlakno=<id>) as a chat. In the account menu of signed-in
 * players; the address works for everyone. Nobody sees who wrote what (backend accounts/forum_views.py); one message
 * per 5 minutes per browser. Not indexed, API in the browser only.
 */
@Component({
  selector: 'app-forum-page',
  imports: [PageHeader, RouterLink, Icon],
  templateUrl: './forum-page.html',
  styleUrl: './forum-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForumPage {
  protected readonly i18n = inject(I18n);
  protected readonly auth = inject(Auth);
  protected readonly t = this.i18n.t;
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** the open thread from ?vlakno= */
  protected readonly threadId = toSignal(
    inject(ActivatedRoute).queryParamMap.pipe(map((q) => Number(q.get('vlakno')) || null)),
    { initialValue: null },
  );

  // the list
  protected readonly threads = signal<ForumThread[] | null>(null);
  protected readonly listFailed = signal(false);
  protected readonly composing = signal(false);
  protected readonly newTitle = signal('');
  protected readonly newBody = signal('');

  // the open thread
  protected readonly thread = signal<ForumThread | null>(null);
  protected readonly posts = signal<ForumPost[]>([]);
  protected readonly threadState = signal<'loading' | 'ready' | 'gone' | 'failed'>('loading');
  protected readonly message = signal('');
  protected readonly confirm = signal<number | 'thread' | null>(null);

  // writing
  protected readonly sending = signal(false);
  protected readonly error = signal<ErrorKey | null>(null);
  /** when this browser may write again (ms since epoch) – the server's 5-minute pause */
  private readonly until = signal(0);
  private readonly now = signal(Date.now());
  protected readonly wait = computed(() => Math.max(0, Math.ceil((this.until() - this.now()) / 1000)));
  private opened = Date.now();
  private readonly seen = signal<Record<string, string>>({});

  private readonly chat = viewChild<ElementRef<HTMLElement>>('chat');

  protected readonly superuser = computed(() => !!this.auth.user()?.is_superuser);
  protected readonly canDeleteThread = computed(
    () => this.superuser() || (!!this.thread()?.mine && this.posts().every((p) => p.mine)),
  );
  protected readonly crumbs = computed(() => [
    { label: this.t().nav.home, link: this.i18n.path('home') },
    { label: this.t().forum.title, link: this.i18n.path('forum') },
  ]);

  constructor() {
    const seo = inject(Seo);
    effect(() => seo.set({ ...this.t().seo.forum, noindex: true }));
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => seo.set(null));

    afterNextRender(() => {
      this.seen.set(this.readSeen());
      const tick = setInterval(() => {
        this.now.set(Date.now());
        if (this.threadId() && document.visibilityState === 'visible' && Date.now() - this.polled >= POLL_MS) {
          void this.poll();
        }
      }, 1000);
      destroyRef.onDestroy(() => clearInterval(tick));
    });

    // the list, or the thread – loaded again whenever the address changes
    effect(() => {
      const id = this.threadId();
      if (!this.isBrowser) return;
      untracked(() => {
        this.error.set(null);
        this.confirm.set(null);
        this.opened = Date.now();
        if (id) void this.loadThread(id);
        else void this.loadList();
      });
    });
  }

  // ---------------------------------------------------------------- list

  private async loadList(): Promise<void> {
    this.listFailed.set(false);
    try {
      const res = await firstValueFrom(this.http.get<{ threads: ForumThread[]; wait: number }>(API));
      this.threads.set(res.threads);
      this.setWait(res.wait);
    } catch {
      this.listFailed.set(true);
    }
  }

  protected compose(open: boolean): void {
    this.composing.set(open);
    this.error.set(null);
    if (open) this.opened = Date.now();
  }

  protected async create(event: Event, trap: HTMLInputElement): Promise<void> {
    event.preventDefault();
    const title = this.newTitle().trim();
    const body = this.newBody().trim();
    if (!title || !body) {
      this.error.set('empty');
      return;
    }
    const created = await this.write<ForumThread>(API, { title, body, website: trap.value });
    if (!created) return;
    this.newTitle.set('');
    this.newBody.set('');
    this.composing.set(false);
    void this.router.navigate([], { queryParams: { vlakno: created.id } });
  }

  protected isNew(thread: ForumThread): boolean {
    const seen = this.seen()[thread.id];
    return !thread.mine && (!seen || seen < thread.last_post_at);
  }

  protected count(thread: ForumThread): string {
    return plural(thread.posts, this.t().forum.posts);
  }

  // ---------------------------------------------------------------- thread

  private polled = 0;

  private async loadThread(id: number): Promise<void> {
    this.threadState.set('loading');
    this.thread.set(null);
    this.posts.set([]);
    this.message.set('');
    try {
      const res = await this.fetchThread(id);
      if (this.threadId() !== id) return;
      this.posts.set(res.posts);
      this.threadState.set('ready');
      this.markSeen(res.thread);
      this.scrollDown(true);
    } catch (err) {
      if (this.threadId() !== id) return;
      this.threadState.set(err instanceof HttpErrorResponse && err.status === 404 ? 'gone' : 'failed');
    }
  }

  private async fetchThread(id: number, after?: number) {
    this.polled = Date.now();
    const params: Record<string, string> = after ? { after: String(after) } : {};
    const res = await firstValueFrom(
      this.http.get<{ thread: ForumThread; posts: ForumPost[]; wait: number }>(`${API}${id}/`, { params }),
    );
    this.thread.set(res.thread);
    this.setWait(res.wait);
    return res;
  }

  /** the newer messages of the open thread (every POLL_MS while the tab is visible) */
  private async poll(): Promise<void> {
    const id = this.threadId();
    if (!id || this.threadState() !== 'ready') return;
    const last = this.posts().at(-1)?.id;
    try {
      const res = await this.fetchThread(id, last);
      if (this.threadId() !== id || !res.posts.length) return;
      const known = new Set(this.posts().map((p) => p.id));
      const fresh = res.posts.filter((p) => !known.has(p.id));
      if (!fresh.length) return;
      this.posts.update((posts) => [...posts, ...fresh]);
      this.markSeen(res.thread);
      this.scrollDown(false);
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 404) this.threadState.set('gone');
    }
  }

  protected async send(event: Event, trap: HTMLInputElement): Promise<void> {
    event.preventDefault();
    const id = this.threadId();
    const body = this.message().trim();
    if (!id || !body || this.sending() || this.wait()) return;
    const post = await this.write<ForumPost>(`${API}${id}/`, { body, website: trap.value });
    if (!post || this.threadId() !== id) return;
    this.message.set('');
    this.posts.update((posts) => [...posts.filter((p) => p.id !== post.id), post]);
    this.thread.update((t) => (t ? { ...t, posts: t.posts + 1, last_post_at: post.at } : t));
    this.markSeen(this.thread());
    this.scrollDown(true);
  }

  /** Ctrl/Cmd + Enter sends, Enter alone is a new line (phones have no Ctrl) */
  protected keydown(event: KeyboardEvent, trap: HTMLInputElement): void {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) void this.send(event, trap);
  }

  protected async deletePost(post: ForumPost): Promise<void> {
    this.confirm.set(null);
    try {
      const res = await firstValueFrom(this.http.delete<{ thread_deleted: boolean }>(`${API}posts/${post.id}/`));
      if (res.thread_deleted) {
        void this.router.navigate([], { queryParams: {} });
        return;
      }
      this.posts.update((posts) => posts.filter((p) => p.id !== post.id));
    } catch {
      this.error.set('failed');
    }
  }

  protected async deleteThread(): Promise<void> {
    const id = this.threadId();
    this.confirm.set(null);
    if (!id) return;
    try {
      await firstValueFrom(this.http.delete(`${API}${id}/`));
      void this.router.navigate([], { queryParams: {} });
    } catch {
      this.error.set('failed');
    }
  }

  protected who(post: ForumPost): string {
    return post.mine ? this.t().forum.you : this.t().forum.alias.replace('{n}', String(post.alias));
  }

  // ---------------------------------------------------------------- shared

  /** POST with the bot guard: the hidden field and how long the form was open */
  private async write<T>(url: string, body: Record<string, string>): Promise<T | null> {
    this.sending.set(true);
    this.error.set(null);
    try {
      const res = await firstValueFrom(
        this.http.post<T & { wait: number }>(url, { ...body, elapsed: Date.now() - this.opened }),
      );
      this.setWait(res.wait);
      this.opened = Date.now();
      return res;
    } catch (err) {
      const detail = err instanceof HttpErrorResponse ? err.error?.detail : undefined;
      if (err instanceof HttpErrorResponse && typeof err.error?.wait === 'number') this.setWait(err.error.wait);
      const known: ErrorKey[] = ['invalid', 'cooldown', 'links', 'busy'];
      this.error.set(
        known.includes(detail) ? detail : err instanceof HttpErrorResponse && err.status === 400 ? 'empty' : 'failed',
      );
      return null;
    } finally {
      this.sending.set(false);
    }
  }

  private setWait(seconds: number | undefined): void {
    this.now.set(Date.now());
    this.until.set(seconds ? Date.now() + seconds * 1000 : 0);
    if (!seconds && this.error() === 'cooldown') this.error.set(null);
  }

  protected waitText(): string {
    const s = this.wait();
    const time = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    return this.t().forum.wait.replace('{time}', time);
  }

  protected when(iso: string): string {
    const date = new Date(iso);
    const today = new Date().toDateString() === date.toDateString();
    return new Intl.DateTimeFormat(this.i18n.locale(), {
      ...(today ? {} : { day: 'numeric', month: 'numeric' }),
      hour: 'numeric',
      minute: '2-digit',
      timeZone: KINGDOM_ZONE,
    }).format(date);
  }

  private scrollDown(always: boolean): void {
    setTimeout(() => {
      const box = this.chat()?.nativeElement;
      if (!box) return;
      const near = box.scrollHeight - box.scrollTop - box.clientHeight < 160;
      if (always || near) box.scrollTop = box.scrollHeight;
    });
  }

  private readSeen(): Record<string, string> {
    try {
      const value = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}');
      return value && typeof value === 'object' ? value : {};
    } catch {
      return {};
    }
  }

  private markSeen(thread: ForumThread | null): void {
    if (!thread || !this.isBrowser) return;
    const seen: Record<string, string> = { ...this.readSeen(), [thread.id]: thread.last_post_at };
    // the newest 200 threads are enough
    const kept: Record<string, string> = Object.fromEntries(Object.entries(seen).slice(-200));
    this.seen.set(kept);
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(kept));
    } catch {
      // private mode – the badge just shows again
    }
  }
}

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
import { FORUM_SEEN_KEY, ForumSeen, ForumUnreadCount, forumUnread, readForumSeen } from '../../core/forum-unread';
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
  /** the superadmin keeps it on top */
  pinned: boolean;
  /** the newest message, shortened (the list) */
  last: string;
}

type Seen = ForumSeen;

/** a message's text cut into plain text and web addresses (made links) */
interface Part {
  text: string;
  href?: string;
}

const URL_RE = /\bhttps?:\/\/[^\s<>"]+/g;

export interface ForumPost {
  id: number;
  body: string;
  at: string;
  /** "Anonym 2" – the writer's number in the thread */
  alias: number;
  mine: boolean;
  /** when its author last changed the text */
  edited: string | null;
  likes: number;
  /** this browser likes it */
  liked: boolean;
  /** the message it answers, shortened */
  reply: { id: number; alias: number; mine: boolean; body: string } | null;
}

type ErrorKey = 'empty' | 'invalid' | 'cooldown' | 'links' | 'busy' | 'failed';

const API = '/api/forum/';
/** the open room asks for new messages this often (only while the tab is visible) */
const POLL_MS = 10_000;
/** what is typed in a thread and not sent yet – kept while the tab lives (the 5-minute pause, a look elsewhere) */
const DRAFT_KEY = 'kd1035.forum.draft.';
/** the list asks again this often while it is open and the tab visible */
const LIST_POLL_MS = 30_000;
/** the message box counts the characters from here on */
const COUNT_FROM = 800;
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
  private readonly unread = inject(ForumUnreadCount);
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
  /** the author's edit open: a message (its id) or the thread's title */
  protected readonly editing = signal<number | 'title' | null>(null);
  protected readonly draft = signal('');
  /** the server's time of the last question – edits made from then on come with the next one */
  private since = '';
  /** the message the next one answers */
  protected readonly replyTo = signal<ForumPost | null>(null);
  /** the answered message lights up for a moment after a click on its quote */
  protected readonly flash = signal<number | null>(null);
  private readonly composer = viewChild<ElementRef<HTMLElement>>('composer');
  private readonly box = viewChild<ElementRef<HTMLTextAreaElement>>('box');

  // writing
  protected readonly sending = signal(false);
  protected readonly error = signal<ErrorKey | null>(null);
  /** when this browser may write again (ms since epoch) – the server's 5-minute pause */
  private readonly until = signal(0);
  private readonly now = signal(Date.now());
  protected readonly wait = computed(() => Math.max(0, Math.ceil((this.until() - this.now()) / 1000)));
  private opened = Date.now();
  private readonly seen = signal<Record<string, Seen>>({});
  /** the first message that came since this browser last read the thread – "Nové správy" above it */
  protected readonly unreadFrom = signal<number | null>(null);
  private listPolled = 0;
  protected readonly countFrom = COUNT_FROM;

  private readonly chat = viewChild<ElementRef<HTMLElement>>('chat');

  protected readonly superuser = computed(() => !!this.auth.user()?.is_superuser);
  /** the whole thread: its author or the superadmin; a message: its author or the superadmin */
  protected readonly canDeleteThread = computed(() => this.superuser() || !!this.thread()?.mine);
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
        if (document.visibilityState !== 'visible') return;
        if (this.threadId() && Date.now() - this.polled >= POLL_MS) void this.poll();
        if (!this.threadId() && this.threads() && Date.now() - this.listPolled >= LIST_POLL_MS) void this.loadList(true);
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
        this.editing.set(null);
        this.replyTo.set(null);
        this.opened = Date.now();
        if (id) void this.loadThread(id);
        else void this.loadList();
      });
    });
  }

  // ---------------------------------------------------------------- list

  /** the threads; `quiet` = the list asking again on its own – a failure keeps what is shown */
  private async loadList(quiet = false): Promise<void> {
    this.listPolled = Date.now();
    if (!quiet) this.listFailed.set(false);
    try {
      const res = await firstValueFrom(this.http.get<{ threads: ForumThread[]; wait: number }>(API));
      this.threads.set(res.threads);
      this.seen.set(this.readSeen());
      this.setWait(res.wait);
    } catch {
      if (!quiet) this.listFailed.set(true);
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

  /** messages since this browser last read the thread – also in my own thread when someone answered */
  protected isNew(thread: ForumThread): boolean {
    return forumUnread(thread, this.seen());
  }

  /** "3 nové" when the count is known, else just "nové" */
  protected newLabel(thread: ForumThread): string {
    const seen = this.seen()[thread.id];
    const fresh = seen && seen.n >= 0 ? thread.posts - seen.n : 0;
    return fresh > 0 ? plural(fresh, this.t().forum.freshCount) : this.t().forum.fresh;
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
    this.message.set(this.readDraft(id));
    this.unreadFrom.set(null);
    try {
      const res = await this.fetchThread(id);
      if (this.threadId() !== id) return;
      this.posts.set(res.posts);
      this.threadState.set('ready');
      // "Nové správy" above the first message from someone else since the last visit (none on the first one)
      const before = this.readSeen()[id]?.at;
      const first = before ? res.posts.find((p) => !p.mine && p.at > before) : undefined;
      this.unreadFrom.set(first?.id ?? null);
      this.markSeen(res.thread);
      // the first visit reads from the top (long posts); back in the thread: the new messages, or the newest one
      if (first) this.settle(() => this.scrollTo(first.id, false));
      else if (before) this.settle(() => this.scrollDown(true, false));
    } catch (err) {
      if (this.threadId() !== id) return;
      this.threadState.set(err instanceof HttpErrorResponse && err.status === 404 ? 'gone' : 'failed');
    }
  }

  private async fetchThread(id: number, after?: number) {
    this.polled = Date.now();
    const params: Record<string, string> = after ? { after: String(after), since: this.since } : {};
    const res = await firstValueFrom(
      this.http.get<{
        thread: ForumThread;
        posts: ForumPost[];
        edited?: ForumPost[];
        likes?: Record<string, number>;
        window?: number;
        now: string;
        wait: number;
      }>(
        `${API}${id}/`,
        { params },
      ),
    );
    this.thread.set(res.thread);
    this.since = res.now;
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
      if (this.threadId() !== id) return;
      // texts their authors changed meanwhile
      const edited = new Map((res.edited ?? []).map((p) => [p.id, p]));
      if (edited.size) this.posts.update((posts) => posts.map((p) => edited.get(p.id) ?? p));
      // the hearts others gave meanwhile, and the messages their authors deleted (missing from the window)
      const likes = res.likes ?? {};
      const window = res.window ?? 0;
      this.posts.update((posts) =>
        posts
          .filter((p) => p.id < window || p.id in likes || p.id > (last ?? 0))
          .map((p) => (p.id in likes && likes[p.id] !== p.likes ? { ...p, likes: likes[p.id] } : p)),
      );
      if (!res.posts.length) return;
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
    const reply = this.replyTo()?.id ?? null;
    const post = await this.write<ForumPost>(`${API}${id}/`, { body, website: trap.value, reply_to: reply });
    if (!post || this.threadId() !== id) return;
    this.setMessage('');
    this.replyTo.set(null);
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

  /** the superadmin keeps the thread on top of the list, or lets it go */
  protected async togglePin(): Promise<void> {
    const thread = this.thread();
    if (!thread) return;
    try {
      this.thread.set(await firstValueFrom(this.http.patch<ForumThread>(`${API}${thread.id}/`, { pinned: !thread.pinned })));
    } catch {
      this.error.set('failed');
    }
  }

  protected setMessage(text: string): void {
    this.message.set(text);
    const id = this.threadId();
    if (!id) return;
    try {
      if (text.trim()) sessionStorage.setItem(DRAFT_KEY + id, text);
      else sessionStorage.removeItem(DRAFT_KEY + id);
    } catch {
      // private mode – nothing kept
    }
  }

  private readDraft(id: number): string {
    try {
      return sessionStorage.getItem(DRAFT_KEY + id) ?? '';
    } catch {
      return '';
    }
  }

  /** a message's text with its web addresses as links (rel="nofollow ugc", a new tab) */
  protected parts(body: string): Part[] {
    const parts: Part[] = [];
    let from = 0;
    for (const match of body.matchAll(URL_RE)) {
      // a full stop or a bracket after an address is the sentence's, not the address's
      const href = match[0].replace(/[.,;:!?)\]]+$/, '');
      const at = match.index ?? 0;
      if (at > from) parts.push({ text: body.slice(from, at) });
      parts.push({ text: href, href });
      from = at + href.length;
    }
    if (from < body.length) parts.push({ text: body.slice(from) });
    return parts;
  }

  protected startEdit(target: ForumPost | 'title'): void {
    this.confirm.set(null);
    this.error.set(null);
    this.editing.set(target === 'title' ? 'title' : target.id);
    this.draft.set(target === 'title' ? (this.thread()?.title ?? '') : target.body);
  }

  /** the author's new text or title – no pause, the server marks a message "upravené" */
  protected async saveEdit(event: Event): Promise<void> {
    event.preventDefault();
    const target = this.editing();
    const id = this.threadId();
    const text = this.draft().trim();
    if (target === null || !id || this.sending()) return;
    if (!text) {
      this.error.set('empty');
      return;
    }
    this.sending.set(true);
    this.error.set(null);
    try {
      if (target === 'title') {
        const thread = await firstValueFrom(this.http.patch<ForumThread>(`${API}${id}/`, { title: text }));
        this.thread.set(thread);
      } else {
        const post = await firstValueFrom(this.http.patch<ForumPost>(`${API}posts/${target}/`, { body: text }));
        this.posts.update((posts) => posts.map((p) => (p.id === post.id ? post : p)));
      }
      this.editing.set(null);
    } catch (err) {
      const detail = err instanceof HttpErrorResponse ? err.error?.detail : undefined;
      this.error.set(detail === 'links' ? 'links' : 'failed');
    } finally {
      this.sending.set(false);
    }
  }

  /** a heart for someone else's message, or taken back – shown at once, the server's count after */
  protected async toggleLike(post: ForumPost): Promise<void> {
    if (post.mine) return;
    const liked = !post.liked;
    const set = (likes: number, on: boolean) =>
      this.posts.update((posts) => posts.map((p) => (p.id === post.id ? { ...p, likes, liked: on } : p)));
    set(Math.max(0, post.likes + (liked ? 1 : -1)), liked);
    try {
      const res = await firstValueFrom(
        this.http.post<{ likes: number; liked: boolean }>(`${API}posts/${post.id}/like/`, { liked }),
      );
      set(res.likes, res.liked);
    } catch {
      set(post.likes, post.liked);
    }
  }

  protected startReply(post: ForumPost): void {
    this.replyTo.set(post);
    this.box()?.nativeElement.focus();
  }

  /** a click on a quote: the answered message in the room, lit up for a moment */
  protected jump(id: number): void {
    const target = this.chat()?.nativeElement.querySelector<HTMLElement>(`#forum-post-${id}`);
    if (!target) return;
    target.scrollIntoView({ block: 'center', behavior: this.motion() });
    this.flash.set(id);
    setTimeout(() => this.flash.set(null), 1600);
  }

  /**
   * A phone's keyboard covers the lower half of the screen (Gether 25. 10. 2026: "nevidím, čo píšem"): the message box
   * goes up above it once the keyboard is out, and again while the visible part of the page changes.
   */
  protected keepVisible(): void {
    const view = window.visualViewport;
    const lift = () => this.composer()?.nativeElement.scrollIntoView({ block: 'end', behavior: this.motion() });
    setTimeout(lift, 350);
    if (!view) return;
    const resize = () => {
      if (document.activeElement === this.box()?.nativeElement) lift();
      else view.removeEventListener('resize', resize);
    };
    view.addEventListener('resize', resize);
  }

  private motion(): ScrollBehavior {
    return matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  }

  protected replyWho(reply: { alias: number; mine: boolean }): string {
    return reply.mine ? this.t().forum.you : this.t().forum.alias.replace('{n}', String(reply.alias));
  }

  protected who(post: ForumPost): string {
    return post.mine ? this.t().forum.you : this.t().forum.alias.replace('{n}', String(post.alias));
  }

  // ---------------------------------------------------------------- shared

  /** POST with the bot guard: the hidden field and how long the form was open */
  private async write<T>(url: string, body: Record<string, unknown>): Promise<T | null> {
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

  /** the page scrolled so that this message (the first unread one) is just under the header */
  private scrollTo(id: number, later = true): void {
    const go = () => this.chat()?.nativeElement.querySelector(`#forum-post-${id}`)?.scrollIntoView({ block: 'start' });
    if (later) setTimeout(go);
    else go();
  }

  /** the newest message above the message box – always, or when the reader is already near the end */
  private scrollDown(always: boolean, later = true): void {
    const go = () => {
      const box = this.chat()?.nativeElement;
      const last = box?.lastElementChild;
      if (!box || !last) return;
      const near = box.getBoundingClientRect().bottom - innerHeight < 320;
      if (always || near) last.scrollIntoView({ block: 'end', behavior: always ? 'auto' : this.motion() });
    };
    if (later) setTimeout(go);
    else go();
  }

  /**
   * A scroll on opening a thread: once the messages are on the page, and once more a moment later – the app puts a new
   * page at the top when its navigation ends, which can come after the messages. Not once the reader scrolled.
   */
  private settle(scroll: () => void): void {
    let moved = false;
    const stop = () => (moved = true);
    const events = ['wheel', 'touchstart', 'keydown', 'mousedown'] as const;
    events.forEach((e) => addEventListener(e, stop, { once: true, passive: true }));
    setTimeout(scroll);
    setTimeout(() => {
      if (!moved) scroll();
      events.forEach((e) => removeEventListener(e, stop));
    }, 450);
  }

  private readSeen(): Record<string, Seen> {
    return readForumSeen();
  }

  private markSeen(thread: ForumThread | null): void {
    if (!thread || !this.isBrowser) return;
    const seen: Record<string, Seen> = { ...this.readSeen(), [thread.id]: { at: thread.last_post_at, n: thread.posts } };
    // the newest 200 threads are enough
    const kept: Record<string, Seen> = Object.fromEntries(Object.entries(seen).slice(-200));
    this.seen.set(kept);
    try {
      localStorage.setItem(FORUM_SEEN_KEY, JSON.stringify(kept));
    } catch {
      // private mode – the badge just shows again
    }
    this.unread.recount();
  }
}

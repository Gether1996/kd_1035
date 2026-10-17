import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { I18n } from '../core/i18n/i18n';
import { KINGDOM_ZONE } from '../core/kingdom-zone';
import { Icon } from './icon';

/** one player of the preview (backend accounts/notices.py preview()) */
export interface NoticePlayer {
  id: number;
  name: string;
  ingame_name: string;
  avatar_url: string;
  /** marches with a red border */
  marches: number;
  /** the message as the player gets it, without the link */
  text: string;
  /** the player switched the bot's messages off – nothing can be sent */
  muted: boolean;
  /** without Discord – the bot cannot write to them, they see the red marches on /marche */
  local?: boolean;
  /** already told about exactly these problems */
  told_at: string | null;
  last: { state: 'pending' | 'sent' | 'failed' | 'skipped'; at: string; error: string } | null;
}

/**
 * "Upozorniť hráčov na chyby" – the superadmin only (Gether 14. 10. 2026), in Hráči on /ucet and on /marche: a preview
 * of every player whose marches show a wrong pair or formation in red, with the exact Discord message; the ticked ones
 * are queued and the worker sends them. Players already told about the same problems, waiting for a message or with the
 * bot's messages off start unticked. Loaded only when opened (the browser only).
 */
@Component({
  selector: 'app-march-notices',
  imports: [Icon],
  template: `
    @let k = t();
    <button type="button" class="pill-btn pill-btn--quiet" (click)="open()">
      <svg appIcon="send"></svg>{{ k.open }}
    </button>
    <dialog #dialog class="modal modal--wide" aria-labelledby="notices-title">
      <div class="modal__body">
        <header class="modal__head">
          <div class="modal__heading">
            <h2 class="modal__title" id="notices-title">{{ k.title }}</h2>
            <p class="modal__eyebrow">Discord</p>
          </div>
          <button type="button" class="modal__close" [attr.aria-label]="k.close" (click)="close()">
            <svg appIcon="x"></svg>
          </button>
        </header>
        <p class="notices__lead">{{ k.lead }}</p>
        @if (failed()) {
          <p class="notices__warn" role="alert">{{ k.loadError }}</p>
        } @else if (data(); as d) {
          @if (!d.bot) {
            <p class="notices__warn">{{ k.noBot }}</p>
          }
          @if (!d.players.length) {
            <p class="notices__lead">{{ k.none }}</p>
          } @else {
            <ul class="notices">
              @for (p of d.players; track p.id) {
                <li class="notice" [class.is-off]="p.muted">
                  <label class="notice__head">
                    <input
                      type="checkbox"
                      class="notice__check"
                      [checked]="picked().has(p.id)"
                      [disabled]="p.muted || !d.bot"
                      (change)="toggle(p.id)"
                    />
                    <img class="notice__avatar" [src]="p.avatar_url" alt="" width="32" height="32" loading="lazy" />
                    <span class="notice__name">
                      <strong>{{ p.ingame_name || p.name }}</strong>
                      <span>{{ count(p.marches) }}</span>
                    </span>
                  </label>
                  <span class="notice__tags">
                    @if (p.muted) {
                      <span class="tag tag--off">{{ p.local ? k.local : k.muted }}</span>
                    }
                    @if (p.last; as last) {
                      <span class="tag" [class.tag--off]="last.state === 'failed'" [title]="last.error">
                        {{ k.state[last.state] }} · {{ date(last.at) }}
                      </span>
                    }
                    @if (p.told_at && p.last?.state !== 'sent') {
                      <span class="tag">{{ k.told.replace('{date}', date(p.told_at)) }}</span>
                    }
                  </span>
                  @if (p.last?.state === 'failed' && p.last?.error) {
                    <p class="notice__error">{{ p.last?.error }}</p>
                  }
                  <p class="notice__text">{{ p.text }}</p>
                </li>
              }
            </ul>
            <div class="notices__actions">
              <button type="button" class="pill-btn" [disabled]="!picked().size || sending() || !d.bot" (click)="send()">
                <svg appIcon="send"></svg>{{ k.send.replace('{n}', '' + picked().size) }}
              </button>
              <p class="notices__state" role="status">{{ result() }}</p>
            </div>
          }
        } @else {
          <p class="notices__lead" aria-busy="true">{{ k.loading }}</p>
        }
      </div>
    </dialog>
  `,
  styles: `
    :host {
      display: contents;
    }

    .pill-btn .icon {
      flex: none;
      width: 15px;
      height: 15px;
    }

    /* wraps on a 320 px phone instead of widening the Hráči panel past the screen */
    .pill-btn {
      max-width: 100%;
      padding-block: 8px;
      line-height: 1.25;
      text-align: center;
      white-space: normal;
    }

    .notices__lead,
    .notices__state {
      margin: 0;
      color: var(--text-dim);
    }

    .notices__warn,
    .notice__error {
      margin: 0;
      color: var(--red-300);
    }

    .notices {
      display: grid;
      gap: 10px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .notice {
      display: grid;
      gap: 8px;
      padding: 12px 14px;
      border: 1px solid var(--line);
      border-radius: var(--radius-sm);
      background: var(--field-bg);

      &.is-off {
        opacity: 0.7;
      }
    }

    .notice__head {
      display: flex;
      align-items: center;
      gap: 10px;
      cursor: pointer;
    }

    .notice__check {
      flex-shrink: 0;
      width: 20px;
      height: 20px;
      accent-color: var(--gold-400);
    }

    .notice__avatar {
      flex-shrink: 0;
      width: 32px;
      height: 32px;
      border-radius: 50%;
    }

    .notice__name {
      display: grid;
      min-width: 0;
      color: var(--text);

      span {
        font-size: 0.8125rem;
        color: var(--red-300);
      }
    }

    .notice__tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;

      &:empty {
        display: none;
      }
    }

    .tag {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      padding: 0 10px;
      border: 1px solid var(--line-strong);
      border-radius: 999px;
      font: 600 0.75rem/1 var(--font-body);
      color: var(--gold-100);
    }

    .tag--off {
      border-color: color-mix(in srgb, var(--red-500) 70%, transparent);
      color: var(--red-300);
    }

    .notice__text {
      margin: 0;
      font-size: 0.875rem;
      line-height: 1.45;
      color: var(--text-dim);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .notices__actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px 14px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarchNotices {
  private readonly http = inject(HttpClient);
  private readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.t().marchNotices);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly data = signal<{ bot: boolean; players: NoticePlayer[] } | null>(null);
  protected readonly failed = signal(false);
  protected readonly sending = signal(false);
  protected readonly result = signal('');
  protected readonly picked = signal<ReadonlySet<number>>(new Set());

  protected open(): void {
    this.dialog().nativeElement.showModal();
    this.result.set('');
    void this.load();
  }

  protected close(): void {
    this.dialog().nativeElement.close();
  }

  private async load(): Promise<void> {
    this.failed.set(false);
    this.data.set(null);
    try {
      const data = await firstValueFrom(this.http.get<{ bot: boolean; players: NoticePlayer[] }>('/api/marches/notices/'));
      this.data.set(data);
      // ticked: whoever can get it, was not told about these problems and has nothing waiting
      this.picked.set(
        new Set(data.players.filter((p) => !p.muted && !p.told_at && p.last?.state !== 'pending').map((p) => p.id)),
      );
    } catch {
      this.failed.set(true);
    }
  }

  protected toggle(id: number): void {
    const next = new Set(this.picked());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.picked.set(next);
  }

  protected async send(): Promise<void> {
    const k = this.t();
    this.sending.set(true);
    try {
      const { queued } = await firstValueFrom(
        this.http.post<{ queued: number }>('/api/marches/notices/', { players: [...this.picked()] }),
      );
      await this.load();
      this.result.set(k.queued.replace('{n}', String(queued)));
    } catch {
      this.result.set(k.failed);
    } finally {
      this.sending.set(false);
    }
  }

  /** "2 marche na opravu" */
  protected count(n: number): string {
    const [one, few, many] = this.t().marches;
    return (n === 1 ? one : n >= 2 && n <= 4 ? few : many).replace('{n}', String(n));
  }

  protected date(iso: string): string {
    return new Intl.DateTimeFormat(this.i18n.locale(), {
      day: 'numeric',
      month: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: KINGDOM_ZONE,
    }).format(
      new Date(iso),
    );
  }
}

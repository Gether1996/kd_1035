import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, afterNextRender, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Auth } from '../../../core/auth';
import { I18n } from '../../../core/i18n/i18n';
import { Icon, IconName } from '../../../shared/icon';

export type ReactionKind = 'like' | 'heart';

/** /api/reactions/<target>/: the counts, the signed-in player's own, the superadmin also who */
export interface ReactionState {
  like: number;
  heart: number;
  mine: ReactionKind[];
  who?: Record<ReactionKind, string[]>;
}

const KINDS: { kind: ReactionKind; icon: IconName }[] = [
  { kind: 'like', icon: 'thumbs-up' },
  { kind: 'heart', icon: 'heart' },
];

/**
 * Likes and hearts on a picture (Gether 4. 11. 2026: "likes a srdiečka, hráči budú môcť pridávať"): the counts for
 * everyone, a signed-in player adds or takes back their own with a click, a visitor is led to sign in; the superadmin
 * also sees who ("daj možnosť pozrieť si, kto tie reakcie dal"). Asked in the browser only – the prerendered page keeps
 * the row's place empty, so nothing jumps; when the API fails the row stays empty.
 */
@Component({
  selector: 'app-reactions',
  imports: [RouterLink, Icon],
  template: `
    @let w = t();
    <div class="reactions" role="group" [attr.aria-label]="w.label">
      @if (state(); as s) {
        @for (k of kinds; track k.kind) {
          @let mine = s.mine.includes(k.kind);
          @let label = w[k.kind] + ': ' + s[k.kind];
          @if (auth.user()) {
            <button
              type="button"
              [class]="'reaction reaction--' + k.kind"
              [class.is-mine]="mine"
              [attr.aria-pressed]="mine"
              [attr.aria-label]="label"
              [title]="w[k.kind]"
              (click)="toggle(k.kind)"
            >
              <svg [appIcon]="k.icon"></svg><span aria-hidden="true">{{ s[k.kind] }}</span>
            </button>
          } @else if (auth.enabled()) {
            <!-- a visitor: to the sign-in, back here afterwards -->
            @let account = auth.accountLink();
            <a
              [class]="'reaction reaction--' + k.kind"
              [routerLink]="account.path"
              [queryParams]="account.query"
              [attr.aria-label]="label + ' – ' + w.signIn"
              [title]="w.signIn"
            >
              <svg [appIcon]="k.icon"></svg><span aria-hidden="true">{{ s[k.kind] }}</span>
            </a>
          } @else {
            <span [class]="'reaction reaction--' + k.kind" [attr.aria-label]="label" role="img">
              <svg [appIcon]="k.icon"></svg><span aria-hidden="true">{{ s[k.kind] }}</span>
            </span>
          }
        }
        @if (s.who; as who) {
          <!-- the superadmin only: who reacted, newest first -->
          <details class="reactions__who">
            <summary>{{ w.who }}</summary>
            @for (k of kinds; track k.kind) {
              <p>
                <svg [appIcon]="k.icon" [attr.aria-label]="w[k.kind]" role="img"></svg>
                {{ who[k.kind].length ? who[k.kind].join(', ') : w.nobody }}
              </p>
            }
          </details>
        }
      }
    </div>
  `,
  styleUrl: './reactions.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Reactions {
  /** the picture, one of REACTION_TARGETS on the server */
  readonly target = input.required<string>();

  private readonly http = inject(HttpClient);
  protected readonly auth = inject(Auth);
  private readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.t().intro.wisdom.reactions);
  protected readonly kinds = KINDS;
  protected readonly state = signal<ReactionState | null>(null);
  private busy = false;

  constructor() {
    afterNextRender(() => void this.load());
  }

  private url(): string {
    return `/api/reactions/${encodeURIComponent(this.target())}/`;
  }

  private async load(): Promise<void> {
    try {
      this.state.set(await firstValueFrom(this.http.get<ReactionState>(this.url())));
    } catch {
      // no row – the picture alone
    }
  }

  /** shown at once, the server's answer then; back as it was when saving fails */
  protected async toggle(kind: ReactionKind): Promise<void> {
    const before = this.state();
    if (!before || this.busy) return;
    this.busy = true;
    const mine = before.mine.includes(kind);
    this.state.set({
      ...before,
      [kind]: Math.max(0, before[kind] + (mine ? -1 : 1)),
      mine: mine ? before.mine.filter((k) => k !== kind) : [...before.mine, kind],
    });
    try {
      this.state.set(await firstValueFrom(this.http.post<ReactionState>(this.url(), { kind })));
    } catch {
      this.state.set(before);
    } finally {
      this.busy = false;
    }
  }
}

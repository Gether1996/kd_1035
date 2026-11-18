import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { I18n } from '../../core/i18n/i18n';
import { Icon } from '../../shared/icon';
import { StrikeMarks } from './strike-marks';
import { VIOLATION_TEXTS } from './texts';
import { BoardPlayer, ViolationsApi, addDays, levelOf } from './violations-api';

/**
 * The Prehľad tab of /priestupky – every approved player (Gether 18. 11. 2026: "druhý tab, ktorý budú vidieť všetci, kde
 * už bude zverejnená tabuľa ľudí s priestupkami a ich timerom, resp. do kedy majú priestupok aktívny, aj nejaký popis"):
 * leadership's description, the strikes, and who has one now – the penalty counting down to the minute, or until when
 * the strike holds after it. Names and strikes only, never the reasons.
 */
@Component({
  selector: 'app-violations-board',
  imports: [Icon, StrikeMarks],
  template: `
    @let x = this.x();
    @if (data.error()) {
      <p class="state">{{ x.error }}</p>
    } @else if (data.hasValue()) {
      @let b = data.value();
      <section class="panel about" [attr.aria-label]="x.eyebrow">
        @if (b.description) {
          <p class="about__text">{{ b.description }}</p>
        }
        <ol class="strikes">
          @for (level of b.levels; track $index) {
            <li class="strike">
              <app-strike-marks [level]="$index + 1" [of]="b.levels.length" />
              <span class="strike__name">{{ level.name }}</span>
              @if (level.penalty || level.days) {
                <span class="strike__penalty">
                  {{ level.penalty }}@if (level.days) {<span class="strike__days"> · {{ x.days.replace('{n}', '' + level.days) }}</span>}
                </span>
              }
            </li>
          }
        </ol>
        <p class="about__reset">{{ b.reset_days ? x.reset.replace('{days}', '' + b.reset_days) : x.resetNow }}</p>
      </section>

      <section class="board" aria-labelledby="board-title">
        <h2 class="board__title" id="board-title"><svg appIcon="flag"></svg>{{ x.board.title }}</h2>
        @if (b.players.length) {
          <ul class="rows">
            @for (p of b.players; track p.id) {
              <li class="row" [class.is-penalty]="!!p.penalty_until">
                <img class="row__avatar" [src]="p.avatar_url" alt="" width="44" height="44" loading="lazy" />
                <div class="row__who">
                  <p class="row__name">{{ p.name }}</p>
                  <p class="row__strike">
                    <app-strike-marks [level]="p.level" [of]="b.levels.length" [label]="strikeLabel(p, b.levels.length)" />
                    <span>{{ levelName(p) }}</span>
                  </p>
                </div>
                <p class="row__time">
                  @if (p.penalty_until; as until) {
                    <strong class="row__left">{{ x.board.penaltyLeft.replace('{time}', left(until)) }}</strong>
                    <span class="row__date">{{ penaltyText(p) }}</span>
                  } @else {
                    <span class="row__date">{{ x.board.clean.replace('{date}', date(addDays(p.reset_on!, -1))) }}</span>
                  }
                </p>
              </li>
            }
          </ul>
        } @else {
          <p class="state">{{ x.board.empty }}</p>
        }
      </section>
    } @else {
      <div class="placeholder" aria-hidden="true"></div>
    }
  `,
  styleUrl: './violations-board.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViolationsBoard {
  private readonly i18n = inject(I18n);
  protected readonly x = computed(() => VIOLATION_TEXTS[this.i18n.lang()]);
  protected readonly data = inject(ViolationsApi).board(() => true);
  protected readonly addDays = addDays;
  /** the countdown moves every minute */
  private readonly now = signal(Date.now());

  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      const timer = setInterval(() => this.now.set(Date.now()), 60_000);
      inject(DestroyRef).onDestroy(() => clearInterval(timer));
    }
  }

  protected levelName(p: BoardPlayer): string {
    const levels = this.data.hasValue() ? this.data.value().levels : [];
    return levelOf(levels, p.level)?.name ?? '';
  }

  protected strikeLabel(p: BoardPlayer, of: number): string {
    return this.x().strike.replace('{n}', String(Math.min(p.level, of))).replace('{of}', String(of));
  }

  protected penaltyText(p: BoardPlayer): string {
    const penalty = p.penalty;
    const until = this.x().board.penaltyUntil.replace('{date}', this.date(p.penalty_until!));
    return penalty ? `${penalty} ${until}` : until;
  }

  /** "5 d 3 h", "3 h 20 min", "12 min" until the end of the penalty's last day (local midnight) */
  protected left(until: string): string {
    const [y, m, d] = until.split('-').map(Number);
    const end = new Date(y, m - 1, d + 1).getTime();
    const minutes = Math.max(0, Math.ceil((end - this.now()) / 60_000));
    const b = this.x().board;
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    const mins = minutes % 60;
    if (days) return b.dayHour.replace('{d}', String(days)).replace('{h}', String(hours));
    if (hours) return b.hourMin.replace('{h}', String(hours)).replace('{m}', String(mins));
    return b.min.replace('{m}', String(mins));
  }

  protected date(iso: string): string {
    return new Intl.DateTimeFormat(this.i18n.locale(), { day: 'numeric', month: 'numeric', year: 'numeric' }).format(
      new Date(iso + 'T12:00:00'),
    );
  }
}

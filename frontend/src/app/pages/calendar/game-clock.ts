import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { I18n } from '../../core/i18n/i18n';
import { Icon } from '../../shared/icon';
import { clock } from './month';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** The next daily reset of the game: 00:00 UTC after `now` (at exactly midnight it is the next one). */
export function nextReset(now: Date): Date {
  return new Date(Math.floor(now.getTime() / DAY) * DAY + DAY);
}

/** Whole minutes left, rounded up – 30 s before the reset still says "1 min". */
export function minutesUntil(now: Date, target: Date): number {
  return Math.ceil((target.getTime() - now.getTime()) / MINUTE);
}

/** Hours and minutes without the zero parts: 568 → "9 h 28 min", 60 → "1 h", 1 → "1 min", 1440 → "24 h". */
export function hoursMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return [hours ? `${hours} h` : '', rest ? `${rest} min` : ''].filter(Boolean).join(' ') || '0 min';
}

/**
 * Game time (UTC) and the countdown to the daily reset (00:00 UTC) above the calendar. The prerendered page shows
 * dashes in the same boxes, so nothing moves when the browser fills them in; the time ticks on the minute.
 */
@Component({
  selector: 'app-game-clock',
  imports: [Icon],
  template: `
    @let g = i18n.t().calendar.clock;
    <section class="clock" [attr.aria-label]="g.label">
      <div class="clock__item">
        <svg appIcon="clock" class="clock__icon"></svg>
        <div>
          <p class="clock__label">{{ g.gameTime }}</p>
          <p class="clock__value">{{ utc() }} <span class="clock__unit">UTC</span></p>
        </div>
      </div>
      <div class="clock__item">
        <svg appIcon="repeat" class="clock__icon"></svg>
        <div>
          <p class="clock__label">{{ g.reset }}</p>
          <p class="clock__value">{{ left() }}</p>
          <p class="clock__note">{{ resetNote() }}</p>
        </div>
      </div>
    </section>
  `,
  styleUrl: './game-clock.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameClock {
  protected readonly i18n = inject(I18n);
  private readonly destroyRef = inject(DestroyRef);

  /** null in the prerendered page */
  protected readonly now = signal<Date | null>(null);

  protected readonly utc = computed(() => {
    const now = this.now();
    return now ? clock(now, this.i18n.locale(), 'UTC') : '–:–';
  });
  protected readonly left = computed(() => {
    const now = this.now();
    return now ? hoursMinutes(minutesUntil(now, nextReset(now))) : '–';
  });
  protected readonly resetNote = computed(() => {
    const now = this.now();
    const time = now ? clock(nextReset(now), this.i18n.locale()) : '–:–';
    return this.i18n.t().calendar.clock.resetAt.replace('{time}', time);
  });

  constructor() {
    afterNextRender(() => {
      const tick = () => this.now.set(new Date());
      tick();
      // on the minute, so the clock never lags behind the phone's clock
      let interval: ReturnType<typeof setInterval> | undefined;
      const align = setTimeout(() => {
        tick();
        interval = setInterval(tick, MINUTE);
      }, MINUTE - (Date.now() % MINUTE) + 50);
      this.destroyRef.onDestroy(() => {
        clearTimeout(align);
        clearInterval(interval);
      });
    });
  }
}

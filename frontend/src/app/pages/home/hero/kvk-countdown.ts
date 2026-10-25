import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { I18n } from '../../../core/i18n/i18n';
import { KINGDOM_ZONE } from '../../../core/kingdom-zone';
import { plural } from '../../reminders/format';

/**
 * The next KvK starts (Gether 25. 10. 2026: "20. 11. 00 UTC"). Once it is past, the countdown hides itself, room and
 * all; for the next KvK set the new start here (UTC) and deploy – it shows again by itself.
 */
export const KVK_START = '2026-11-20T00:00:00Z';

/**
 * "Do začiatku KvK" under the number on the home page: days, hours, minutes and seconds to KVK_START, ticking once a
 * second. Counted in the browser only (the prerendered page keeps the room for it empty), gone once the KvK started.
 */
@Component({
  selector: 'app-kvk-countdown',
  template: `
    @if (left(); as units) {
      @let c = i18n.t().hero.countdown;
      <div class="countdown" role="timer" [attr.aria-label]="c.label + ' – ' + startText()">
        <p class="countdown__label">{{ c.label }}</p>
        <p class="countdown__units" aria-hidden="true">
          @for (u of units; track u.key) {
            <span class="countdown__unit">
              <span class="countdown__value">{{ u.value }}</span>
              <span class="countdown__name">{{ u.name }}</span>
            </span>
          }
        </p>
      </div>
    }
  `,
  styleUrl: './kvk-countdown.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // the KvK started: not even the room kept for the numbers (Gether: "keď odpočet skončí, automaticky ho schovaj")
  host: { '[class.is-over]': 'over()' },
})
export class KvkCountdown {
  protected readonly i18n = inject(I18n);
  private readonly start = Date.parse(KVK_START);
  /** null on the server and before the first tick */
  private readonly now = signal<number | null>(null);

  /** a page prerendered after the start keeps no room either */
  private readonly pastAtRender = Date.now() >= this.start;

  protected readonly over = computed(() => {
    const now = this.now();
    return this.pastAtRender || (now !== null && now >= this.start);
  });

  protected readonly left = computed(() => {
    const now = this.now();
    if (now === null || now >= this.start) return null;
    const c = this.i18n.t().hero.countdown;
    const total = Math.floor((this.start - now) / 1000);
    const parts = [
      { key: 'd', n: Math.floor(total / 86_400), names: c.days },
      { key: 'h', n: Math.floor((total % 86_400) / 3600), names: c.hours },
      { key: 'm', n: Math.floor((total % 3600) / 60), names: c.minutes },
      { key: 's', n: total % 60, names: c.seconds },
    ];
    return parts.map((p) => ({
      key: p.key,
      value: p.key === 'd' ? String(p.n) : String(p.n).padStart(2, '0'),
      // the word alone, in the right form for the number ("dni" / "dní")
      name: plural(p.n, p.names.map((name) => name.replace('{n} ', ''))),
    }));
  });

  /** "20. 11. 2026 1:00" in the kingdom's time – for screen readers, who do not hear the ticking numbers */
  protected readonly startText = computed(() =>
    new Intl.DateTimeFormat(this.i18n.locale(), {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: KINGDOM_ZONE,
    }).format(this.start),
  );

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      this.now.set(Date.now());
      if (this.over()) return;
      const tick = setInterval(() => {
        this.now.set(Date.now());
        if (this.over()) clearInterval(tick);
      }, 1000);
      destroyRef.onDestroy(() => clearInterval(tick));
    });
  }
}

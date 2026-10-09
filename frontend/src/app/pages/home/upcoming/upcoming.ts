import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { EventsApi, Occurrence, eventName } from '../../../core/events-api';
import { I18n } from '../../../core/i18n/i18n';
import { EventIcon } from '../../../shared/event-icon';
import { occurrenceShowsClock } from '../../../shared/event-time';
import { Icon } from '../../../shared/icon';
import { Reveal } from '../../../shared/reveal';
import { KINGDOM_ZONE, calendarQuery } from '../../calendar/deep-link';
import { addDays, clock, dayKey, daysOf, isDaily, shortDay } from '../../calendar/month';

/** how far ahead the home page looks */
const DAYS = 14;
const LIMIT = 3;
/** the calendar's accents (calendar.ts accent()) – an event has the same colour on both pages */
const ACCENTS = ['gold', 'red', 'navy'] as const;

interface Card {
  key: string;
  item: Occurrence;
  name: string;
  accent: string;
  query: { event: number; on: string };
  running: boolean;
  /** "Dnes", "Zajtra" or "so 17. 10." */
  day: string;
  /** start in the visitor's time and in UTC – only where the calendar shows a time (occurrenceShowsClock) */
  time: { local: string; utc: string } | null;
  /** "po 19. 10. – so 24. 10." for events that run for days */
  range: string;
}

/**
 * Home: the next three kingdom events, each a link to its dialog in the calendar. Built in the browser only (it depends
 * on today); while loading, on an API error or with nothing coming up the section is not there at all.
 */
@Component({
  selector: 'app-upcoming',
  imports: [RouterLink, EventIcon, Icon, Reveal],
  template: `
    @let u = t();
    @if (cards().length) {
      <section class="section" id="events" aria-labelledby="upcoming-title">
        <div class="container">
          <header class="section-head" appReveal>
            <p class="eyebrow">{{ u.eyebrow }}</p>
            <h2 class="title" id="upcoming-title">{{ u.title }}</h2>
          </header>

          <ul class="cards" [style.--count]="cards().length">
            @for (card of cards(); track card.key; let i = $index) {
              <li [appReveal]="i * 120">
                <a
                  class="card"
                  [attr.data-accent]="card.accent"
                  [routerLink]="i18n.path('calendar')"
                  [queryParams]="card.query"
                >
                  <span class="card__top">
                    <app-event-icon class="card__icon" [src]="card.item.icon" [name]="card.name" />
                    @if (card.running) {
                      <span class="tag card__live">{{ u.running }}</span>
                    } @else {
                      <span class="card__day">{{ card.day }}</span>
                    }
                  </span>
                  <strong class="card__name">{{ card.name }}</strong>
                  <span class="card__when">
                    @if (card.time; as time) {
                      {{ time.local }} <small>UTC {{ time.utc }}</small>
                    } @else {
                      {{ card.range }}
                    }
                  </span>
                  <svg class="card__arrow" appIcon="arrow-right"></svg>
                </a>
              </li>
            }
          </ul>

          <p class="more">
            <a class="btn btn--ghost" [routerLink]="i18n.path('calendar')">
              <svg appIcon="calendar-days"></svg> {{ u.all }}
            </a>
          </p>
        </div>
      </section>
    }
  `,
  styleUrl: './upcoming.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Upcoming {
  protected readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.t().upcoming);
  private readonly destroyRef = inject(DestroyRef);

  /** null until the page runs in the browser */
  private readonly now = signal<Date | null>(null);
  /** today in the kingdom (a string, so the minute tick does not ask again) */
  private readonly from = computed(() => {
    const now = this.now();
    return now ? dayKey(now, KINGDOM_ZONE) : null;
  });
  private readonly data = inject(EventsApi).calendar(() => {
    const from = this.from();
    return from ? { from, to: addDays(from, DAYS) } : null;
  });

  /** running or coming runs, soonest first, without the daily ones (the calendar lists those once, "Každý deň") */
  protected readonly cards = computed<Card[]>(() => {
    const now = this.now();
    if (!now || !this.data.hasValue() || this.data.error()) return [];
    const time = now.getTime();
    return this.data
      .value()
      .occurrences.filter((o) => !isDaily(o) && Date.parse(o.end ?? o.start) > time)
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || a.id - b.id)
      .slice(0, LIMIT)
      .map((item) => this.card(item, now));
  });

  constructor() {
    afterNextRender(() => {
      const tick = () => this.now.set(new Date());
      tick();
      // "Prebieha" and the runs that are over move on by themselves
      const timer = setInterval(tick, 60_000);
      this.destroyRef.onDestroy(() => clearInterval(timer));
    });
  }

  private card(item: Occurrence, now: Date): Card {
    const locale = this.i18n.locale();
    const u = this.t();
    const today = dayKey(now);
    const { first, last } = daysOf(item);
    const start = Date.parse(item.start);
    return {
      key: `${item.id}-${item.start}`,
      item,
      name: eventName(item, this.i18n.lang()),
      accent: ACCENTS[item.id % ACCENTS.length],
      query: calendarQuery(item, now),
      running: start <= now.getTime(),
      day: first === today ? u.today : first === addDays(today, 1) ? u.tomorrow : shortDay(first, locale),
      time: occurrenceShowsClock(item)
        ? { local: clock(item.start, locale), utc: clock(item.start, locale, 'UTC') }
        : null,
      range: first === last ? shortDay(first, locale) : `${shortDay(first, locale)} – ${shortDay(last, locale)}`,
    };
  }
}

import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { eventName } from '../../core/events-api';
import { GuideEvent } from '../../core/guides-api';
import { I18n } from '../../core/i18n/i18n';
import { EventIcon } from '../../shared/event-icon';
import { occurrenceShowsClock } from '../../shared/event-time';
import { Icon } from '../../shared/icon';
import { calendarQuery } from '../calendar/deep-link';
import { addDays, clock, dayKey, daysOf, shortDay } from '../calendar/month';

interface Row {
  id: number;
  name: string;
  icon: string | null;
  /** ?event=<id>&on=<day> opens the event's dialog in the calendar on the month of this run; ?event=<id> alone an
   *  irregular event without a date (the calendar finds it among those waiting) */
  query: { event: number; on?: string };
  running: boolean;
  /** "Dnes", "Zajtra", "so 17. 10." or "po 19. 10. – so 24. 10."; null = no date announced yet */
  when: string | null;
  /** start in the visitor's time and in UTC – only where the calendar shows a time (occurrenceShowsClock) */
  time: { local: string; utc: string } | null;
}

/**
 * Guide page: the running or next run of each event linked to the guide ("V kalendári"), with a link to its dialog in
 * the calendar, where players set reminders. The guide is the content, so the card stays small.
 */
@Component({
  selector: 'app-guide-events',
  imports: [RouterLink, EventIcon, Icon],
  template: `
    @let c = t();
    <section class="events" aria-labelledby="guide-events-title">
      <h2 class="events__title" id="guide-events-title"><svg appIcon="calendar-days"></svg> {{ c.title }}</h2>
      <ul class="events__list">
        @for (row of rows(); track row.id) {
          <li class="event">
            <app-event-icon class="event__icon" [src]="row.icon" [name]="row.name" />
            <span class="event__body">
              <strong class="event__name">{{ row.name }}</strong>
              <span class="event__when">
                @if (row.running) {
                  <span class="tag event__live">{{ c.running }}</span>
                }
                @if (row.when === null) {
                  {{ c.announceLater }}
                } @else {
                  {{ row.when }}
                  @if (row.time; as time) {
                    · {{ time.local }} <small>UTC {{ time.utc }}</small>
                  }
                }
              </span>
            </span>
            <a
              class="pill-btn pill-btn--quiet event__remind"
              [routerLink]="i18n.path('calendar')"
              [queryParams]="row.query"
              [attr.aria-label]="c.remind + ': ' + row.name"
            >
              <svg appIcon="bell"></svg> <span class="event__label">{{ c.remind }}</span>
            </a>
          </li>
        }
      </ul>
    </section>
  `,
  styleUrl: './guide-events.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuideEvents {
  readonly events = input.required<GuideEvent[]>();

  protected readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.t().guides.inCalendar);

  /** the guide is fetched in the browser only, so "now" is the visitor's */
  protected readonly rows = computed<Row[]>(() => this.events().map((event) => this.row(event, new Date())));

  private row(event: GuideEvent, now: Date): Row {
    const base = { id: event.id, name: eventName(event, this.i18n.lang()), icon: event.icon };
    const start = event.start;
    if (!start) return { ...base, query: { event: event.id }, running: false, when: null, time: null };

    const locale = this.i18n.locale();
    const upcoming = this.i18n.t().upcoming; // "Dnes" / "Zajtra" like the home page
    const today = dayKey(now);
    const run = { ...event, start };
    const { first, last } = daysOf(run);
    const day =
      first === today ? upcoming.today : first === addDays(today, 1) ? upcoming.tomorrow : shortDay(first, locale);
    return {
      ...base,
      query: calendarQuery(run, now),
      running: Date.parse(start) <= now.getTime(),
      when: first === last ? day : `${shortDay(first, locale)} – ${shortDay(last, locale)}`,
      time: occurrenceShowsClock(run) ? { local: clock(start, locale), utc: clock(start, locale, 'UTC') } : null,
    };
  }
}

import { isPlatformBrowser } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { GuideCategory, Lang } from './i18n/i18n';

export interface EventGuide {
  category: GuideCategory;
  slug: string;
  title_sk: string;
  title_cs: string;
}

/** What anyone may see about a kingdom event. */
export interface PublicEvent {
  id: number;
  name_sk: string;
  /** '' = the Slovak name is shown */
  name_cs: string;
  /** minutes before the start that leadership offers for personal reminders */
  offered: number[];
  /** published guide only */
  guide: EventGuide | null;
}

/** One run of an event. */
export interface Occurrence extends PublicEvent {
  /** ISO 8601 in UTC */
  start: string;
  /** null = no end (duration 0) */
  end: string | null;
  /** 0 = one-off */
  repeat_days: number;
  /** no fixed cycle – leadership sets each date */
  irregular: boolean;
}

export interface EventCalendar {
  /** the days asked for (Europe/Bratislava), both included */
  from: string;
  to: string;
  /** soonest first; a multi-day event that started before `from` and still runs is included */
  occurrences: Occurrence[];
  /** irregular events without a next date yet ("ďalší termín oznámime") */
  irregular_waiting: PublicEvent[];
}

export function isOccurrence(item: PublicEvent): item is Occurrence {
  return 'start' in item;
}

export function eventName(item: PublicEvent, lang: Lang): string {
  return (lang === 'cs' && item.name_cs) || item.name_sk;
}

/** Public calendar of kingdom events (/api/events/). Only asked in the browser. */
@Injectable({ providedIn: 'root' })
export class EventsApi {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Occurrences in the days `range()` returns, again whenever it changes (call in an injection context). */
  calendar(range: () => { from: string; to: string } | null) {
    return httpResource<EventCalendar>(() => {
      const days = range();
      return this.isBrowser && days ? { url: '/api/events/', params: { from: days.from, to: days.to } } : undefined;
    });
  }
}

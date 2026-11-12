import { isPlatformBrowser } from '@angular/common';
import { HttpClient, httpResource } from '@angular/common/http';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { EventVariant } from './events-api';

export type TimeBasis = 'local' | 'utc';

/** An event as a superuser edits it (/api/events/manage/) – the same fields as in the admin. */
export interface EventFields {
  name_sk: string;
  name_cs: string;
  /** icon slug, '' = monogram */
  icon: string;
  message: string;
  /** first start, ISO 8601 in UTC */
  starts_at: string;
  /** 0 = no end */
  duration_minutes: number;
  /** 0 = one-off */
  repeat_days: number;
  /** last day of the series (YYYY-MM-DD, Bratislava), null = no end */
  until: string | null;
  irregular: boolean;
  time_basis: TimeBasis;
  /** Discord channel reminders, minutes before the start */
  reminders: number[];
  notify_discord: boolean;
  mention_role: boolean;
  mention_role_id: string;
  show_on_web: boolean;
  /** minutes offered to players */
  player_reminders: number[];
  guide: number | null;
  is_active: boolean;
}

export interface ManagedEvent extends EventFields {
  id: number;
  icon_url: string | null;
  /** the next start or the one running now (ISO, UTC); null = nothing ahead */
  next_start: string | null;
  /** HH:MM in the event's time basis */
  usual_time: string;
  /** players who picked it for their reminders */
  players: number;
  /**
   * an irregular event's dates (newest first, ISO), the usual gap in days and a guess of the next date
   * (Gether 7. 11. 2026); null for a regular event, missing in an older response
   */
  history?: { dates: string[]; every_days: number | null; guess: string | null } | null;
  /** the types its runs can be (added in the admin) */
  variants: (EventVariant & { id: number })[];
}

export interface ManageData {
  /** active first by the next date, inactive drafts at the end */
  events: ManagedEvent[];
  icons: { slug: string; label: string; url: string }[];
  guides: { id: number; title_sk: string; title_cs: string; published: boolean }[];
  reminder_choices: number[];
  /** the Discord channel webhook is set up */
  webhook: boolean;
}

/** DRF validation errors: field → messages */
export type FieldErrors = Partial<
  Record<keyof EventFields | 'non_field_errors' | 'start', string[]>
>;

const URL = '/api/events/manage/';

/** The superadmin's note to an event (Gether 12. 11. 2026: the order of players he emails after every 20 GH) */
export interface EventNote {
  id: number;
  /** the run it is about (ISO, UTC); null = the event in general */
  run_start: string | null;
  text: string;
  created_at: string;
  updated_at: string;
}

/** /api/events/manage/<id>/notes/ – every note of the event, the newest run first */
export const eventNotesUrl = (id: number) => `${URL}${id}/notes/`;

/** Event management for superusers in the calendar. Session + CSRF; only called in the browser. */
@Injectable({ providedIn: 'root' })
export class EventsAdminApi {
  private readonly http = inject(HttpClient);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Everything the management needs; nothing is asked while `when` is false (not a superuser). */
  data(when: () => boolean) {
    return httpResource<ManageData>(() => (this.isBrowser && when() ? URL : undefined));
  }

  create(fields: Partial<EventFields>): Promise<ManagedEvent> {
    return firstValueFrom(this.http.post<ManagedEvent>(URL, fields));
  }

  update(id: number, fields: Partial<EventFields>): Promise<ManagedEvent> {
    return firstValueFrom(this.http.patch<ManagedEvent>(`${URL}${id}/`, fields));
  }

  async remove(id: number): Promise<void> {
    await firstValueFrom(this.http.delete(`${URL}${id}/`));
  }

  /** The next date of an irregular event (replaces the one set before). */
  setDate(id: number, start: string): Promise<ManagedEvent> {
    return firstValueFrom(this.http.put<ManagedEvent>(`${URL}${id}/date/`, { start }));
  }

  /** The type of the run starting at `start` (ISO); null = no type. */
  async setRunVariant(id: number, start: string, variant: number | null): Promise<void> {
    const url = `${URL}${id}/run/`;
    if (variant === null) await firstValueFrom(this.http.delete(url, { body: { start } }));
    else await firstValueFrom(this.http.put(url, { start, variant }));
  }

  /** A new note to the event, about the run starting at `runStart` (null = the event in general). */
  addNote(id: number, text: string, runStart: string | null): Promise<EventNote> {
    return firstValueFrom(this.http.post<EventNote>(eventNotesUrl(id), { text, run_start: runStart }));
  }

  updateNote(noteId: number, text: string): Promise<EventNote> {
    return firstValueFrom(this.http.patch<EventNote>(`${URL}notes/${noteId}/`, { text }));
  }

  async removeNote(noteId: number): Promise<void> {
    await firstValueFrom(this.http.delete(`${URL}notes/${noteId}/`));
  }

  /** No date: the event waits for the next one again. */
  clearDate(id: number): Promise<ManagedEvent> {
    return firstValueFrom(this.http.delete<ManagedEvent>(`${URL}${id}/date/`));
  }
}

import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpErrorResponse, httpResource } from '@angular/common/http';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface Alarm {
  id: number;
  /** '' = the bot writes "Budík" */
  note: string;
  /** when the thing happens, ISO 8601 UTC */
  target: string;
  /** when the bot writes, ISO 8601 UTC */
  remind_at: string;
}

export interface AlarmList {
  alarms: Alarm[];
  max: number;
}

/** Why a new alarm was refused: the time has passed (or is under a minute away), more than 14 days ahead, too many
 * waiting, anything else */
export type AlarmError = 'too_soon' | 'too_far' | 'limit' | 'failed';

const URL = '/api/me/alarms/';

/** The signed-in player's one-off alarms (backend accounts/alarm_views.py); browser only, session + CSRF. */
@Injectable({ providedIn: 'root' })
export class AlarmsApi {
  private readonly http = inject(HttpClient);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** must run in an injection context (a field initializer) */
  list() {
    return httpResource<AlarmList>(() => (this.isBrowser ? URL : undefined));
  }

  async add(target: Date, lead: number, note: string): Promise<Alarm | AlarmError> {
    try {
      return await firstValueFrom(this.http.post<Alarm>(URL, { target: target.toISOString(), lead, note }));
    } catch (e) {
      const body = e instanceof HttpErrorResponse && e.status === 400 ? e.error : null;
      if (body?.detail === 'limit') return 'limit';
      const code = body?.target?.[0];
      return code === 'too_soon' || code === 'too_far' ? code : 'failed';
    }
  }

  async remove(id: number): Promise<boolean> {
    try {
      await firstValueFrom(this.http.delete(`${URL}${id}/`));
      return true;
    } catch (error) {
      // 404: already sent (or cancelled elsewhere) – gone either way
      return error instanceof HttpErrorResponse && error.status === 404;
    }
  }
}

import { isPlatformBrowser } from '@angular/common';
import { HttpClient, httpResource } from '@angular/common/http';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Build } from './armory';
import { March, MarchKind, MarchStat } from './kvk-api';

export type MarchChange = Partial<
  { kind: MarchKind | ''; primary: string; secondary: string; primary_skills: string; secondary_skills: string } &
    Record<MarchStat, number | null> &
    Build
>;

/** /api/commanders/marches/ – every commander a march may name (backend/guides/roster.py) */
export const marchCommandersUrl = '/api/commanders/marches/';

export interface MarchCommander {
  name: string;
  /** the portrait, /static/guides/commanders/<file>.webp */
  icon: string;
  /** offered in the picker; false = left out (golden keys, gatherers, epic), listed for the portrait of old marches */
  pick: boolean;
  /** the troop type in the game (infantry, cavalry, archer, leadership, engineering, integration) */
  troop?: string | null;
  /** march type → rank in its pair guide (0 = best); only infantry, cavalry, archer and siege have one */
  meta?: Partial<Record<MarchKind, number>>;
}

export interface PlayerMarches {
  id: number;
  name: string;
  ingame_name: string;
  avatar_url: string;
  /** the player shows the marches to everyone (else only R4 sees them) */
  public: boolean;
  /** the visitor's own marches */
  me: boolean;
  /** false: not approved – hidden from everyone but the superuser */
  approved: boolean;
  marches: March[];
  /** the last change of one of the marches (ISO) */
  updated_at: string;
}

/** The player's marches on /ucet (backend accounts/march_views.py); browser only, session + CSRF. */
@Injectable({ providedIn: 'root' })
export class MarchesApi {
  private readonly http = inject(HttpClient);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** must run in an injection context */
  list() {
    return httpResource<{ marches: March[]; max: number; public: boolean }>(() =>
      this.isBrowser ? '/api/me/marches/' : undefined,
    );
  }

  /** true = every signed-in player sees the marches, false = only R4 and the superuser */
  setPublic(value: boolean): Promise<{ public: boolean }> {
    return firstValueFrom(this.http.patch<{ public: boolean }>('/api/me/marches/', { public: value }));
  }

  /** /marche: the public marches of every player (all of them for R4); must run in an injection context */
  players(when: () => boolean) {
    return httpResource<{ players: PlayerMarches[]; reviewer: boolean }>(() =>
      this.isBrowser && when() ? '/api/marches/' : undefined,
    );
  }

  /** a new march – its type and primary commander are required */
  add(march: MarchChange): Promise<March> {
    return firstValueFrom(this.http.post<March>('/api/me/marches/', march));
  }

  update(id: number, change: MarchChange): Promise<March> {
    return firstValueFrom(this.http.patch<March>(`/api/me/marches/${id}/`, change));
  }

  remove(id: number): Promise<unknown> {
    return firstValueFrom(this.http.delete(`/api/me/marches/${id}/`));
  }
}

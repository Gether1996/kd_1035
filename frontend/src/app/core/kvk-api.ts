import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpErrorResponse, httpResource } from '@angular/common/http';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type ImageKind = 'vip' | 'equipment' | 'armaments' | 'commanders';
export const IMAGE_KINDS: ImageKind[] = ['vip', 'equipment', 'armaments', 'commanders'];
/** screenshots per kind (backend kvk.MAX_PER_KIND) */
export const MAX_PER_KIND = 3;

export interface KvkRound {
  id: number;
  title_sk: string;
  /** '' = the Slovak title */
  title_cs: string;
  is_open: boolean;
  created_at: string;
  closed_at: string | null;
  /** number of sign-ups – in the rounds list only */
  signups?: number;
}

export interface KvkImage {
  id: number;
  kind: ImageKind;
  url: string;
  thumb: string;
  width: number;
  height: number;
}

export interface KvkSignup {
  id: number;
  round: number;
  rally: boolean;
  garrison: boolean;
  commanders: string;
  note: string;
  updated_at: string;
  images: KvkImage[];
  /** a screenshot of every kind */
  complete: boolean;
  /** for reviewers */
  player?: { id: number; name: string; ingame_name: string; avatar_url: string; discord_id: string };
  /** for reviewers: the player's marches from /ucet */
  marches?: March[];
}

export type MarchKind =
  | 'infantry'
  | 'cavalry'
  | 'archer'
  | 'leadership'
  | 'engineering'
  | 'garrison'
  | 'conquering';
export const MARCH_KINDS: MarchKind[] = [
  'infantry',
  'cavalry',
  'archer',
  'leadership',
  'engineering',
  'garrison',
  'conquering',
];
/** the specialty icons of the guides (backend guides/static/guides/specialties) */
export const marchIcon = (kind: MarchKind) => `/static/guides/specialties/${kind}.webp`;

export interface MarchImage {
  id: number;
  kind: 'equipment' | 'armaments';
  url: string;
  thumb: string;
  width: number;
  height: number;
}

export interface March {
  id: number;
  position: number;
  kind: MarchKind | '';
  /** commander names from our guides, '' = not chosen */
  primary: string;
  secondary: string;
  images: MarchImage[];
}

export interface KvkState {
  /** the open round, null = sign-ups closed */
  round: KvkRound | null;
  /** the player's sign-up in the open round */
  signup: KvkSignup | null;
  /** the player's sign-ups in closed rounds (deleted 60 days after closing) – may be withdrawn */
  older: { round: KvkRound; signup: KvkSignup }[];
  /** signed in with Discord */
  player: boolean;
  ingame_name: string;
  reviewer: boolean;
  superuser: boolean;
}

export interface SignupForm {
  ingame_name: string;
  rally: boolean;
  garrison: boolean;
  commanders: string;
  note: string;
}

export interface ReviewerRow {
  id: number;
  name: string;
  ingame_name: string;
  avatar_url: string;
  reviewer: boolean;
  superuser: boolean;
}

/** Why an upload failed: not an image, over 10 MB, three of that kind already, too many uploads in an hour, anything else */
export type UploadError = 'not_image' | 'too_big' | 'limit' | 'throttled' | 'failed';

export function uploadError(e: unknown): UploadError {
  if (!(e instanceof HttpErrorResponse)) return 'failed';
  if (e.status === 429) return 'throttled';
  const detail = e.error?.detail;
  return detail === 'not_image' || detail === 'too_big' || detail === 'limit' ? detail : 'failed';
}

/** KvK sign-ups (backend accounts/kvk_views.py); browser only, session + CSRF. */
@Injectable({ providedIn: 'root' })
export class KvkApi {
  private readonly http = inject(HttpClient);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** must run in an injection context; `version` asks again after a change */
  state(version: () => number) {
    return httpResource<KvkState>(() => (this.isBrowser ? { url: '/api/kvk/', params: { v: version() } } : undefined));
  }

  saveSignup(form: SignupForm): Promise<KvkSignup> {
    return firstValueFrom(this.http.put<KvkSignup>('/api/kvk/signup/', form));
  }

  /** the sign-up of that round (default: the open one) */
  withdraw(round?: number): Promise<unknown> {
    return firstValueFrom(this.http.delete('/api/kvk/signup/', round ? { params: { round } } : {}));
  }

  async upload(kind: ImageKind, file: File): Promise<KvkImage | UploadError> {
    const body = new FormData();
    body.append('kind', kind);
    body.append('file', file);
    try {
      return await firstValueFrom(this.http.post<KvkImage>('/api/kvk/signup/images/', body));
    } catch (e) {
      return uploadError(e);
    }
  }

  removeImage(id: number): Promise<unknown> {
    return firstValueFrom(this.http.delete(`/api/kvk/signup/images/${id}/`));
  }

  rounds(when: () => boolean, version: () => number) {
    return httpResource<{ rounds: KvkRound[] }>(() =>
      this.isBrowser && when() ? { url: '/api/kvk/rounds/', params: { v: version() } } : undefined,
    );
  }

  signups(round: () => number | null) {
    return httpResource<{ round: KvkRound; signups: KvkSignup[] }>(() => {
      const id = round();
      return this.isBrowser && id ? `/api/kvk/rounds/${id}/signups/` : undefined;
    });
  }

  createRound(title_sk: string, title_cs: string): Promise<KvkRound> {
    return firstValueFrom(this.http.post<KvkRound>('/api/kvk/rounds/', { title_sk, title_cs }));
  }

  updateRound(id: number, change: Partial<Pick<KvkRound, 'title_sk' | 'title_cs' | 'is_open'>>): Promise<KvkRound> {
    return firstValueFrom(this.http.patch<KvkRound>(`/api/kvk/rounds/${id}/`, change));
  }

  deleteRound(id: number): Promise<unknown> {
    return firstValueFrom(this.http.delete(`/api/kvk/rounds/${id}/`));
  }

  reviewers(when: () => boolean) {
    return httpResource<{ players: ReviewerRow[] }>(() => (this.isBrowser && when() ? '/api/kvk/reviewers/' : undefined));
  }

  setReviewer(id: number, reviewer: boolean): Promise<{ id: number; reviewer: boolean }> {
    return firstValueFrom(this.http.patch<{ id: number; reviewer: boolean }>(`/api/kvk/reviewers/${id}/`, { reviewer }));
  }
}

import { HttpClient, HttpErrorResponse, httpResource } from '@angular/common/http';
import { Injectable, computed, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Auth } from './auth';

export type GovernorKind = 'main' | 'farm';
export type GovernorStatus = 'pending' | 'approved' | 'rejected';

export interface Governor {
  id: number;
  governor_id: string;
  name: string;
  kind: GovernorKind;
  /** null = other alliance or none */
  alliance: { id: number; tag: string } | null;
  status: GovernorStatus;
  /** written by R4 in the admin, e.g. why it was rejected */
  review_note: string;
  created_at: string;
}

export interface NewGovernor {
  governor_id: string;
  name: string;
  kind: GovernorKind;
  alliance: number | null;
}

/** Codes from the API (backend/accounts/views.py) + 'throttled' (429) and 'failed' (anything else). */
export type GovernorError = 'invalid_id' | 'invalid_name' | 'taken' | 'limit' | 'invalid' | 'throttled' | 'failed';

const API_CODES: GovernorError[] = ['invalid_id', 'invalid_name', 'taken', 'limit', 'invalid'];
const URL = '/api/me/governors/';

/** Same rules as the backend (accounts/models.py). */
export const MAX_GOVERNORS = 5;
export const GOVERNOR_ID = /^[0-9]{6,12}$/;
export const GOVERNOR_NAME_MAX = 32;

export function governorError(error: unknown): GovernorError {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 429) return 'throttled';
    const code = error.error?.code;
    if (error.status === 400 && API_CODES.includes(code)) return code;
  }
  return 'failed';
}

/**
 * The signed-in player's Governor ID registrations (R4 approve them in the admin). Loaded only for a player –
 * Auth asks the API in the browser only, so prerendering never calls it.
 */
@Injectable({ providedIn: 'root' })
export class GovernorsApi {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(Auth);
  // the same URL for every reload of /api/auth/me/ – the list is fetched again only after another sign-in
  private readonly res = httpResource<Governor[]>(() => (this.auth.user()?.discord_id ? URL : undefined));

  readonly ready = computed(() => this.res.hasValue() || !!this.res.error());
  readonly failed = computed(() => !!this.res.error());
  readonly list = computed(() => (this.res.hasValue() ? this.res.value() : []));
  readonly full = computed(() => this.list().length >= MAX_GOVERNORS);

  /** Rejects with a GovernorError. The new entry is waiting for approval, so it goes on top. */
  async add(governor: NewGovernor): Promise<void> {
    try {
      const created = await firstValueFrom(this.http.post<Governor>(URL, governor));
      this.res.set([created, ...this.list()]);
    } catch (error) {
      throw governorError(error);
    }
  }

  async remove(id: number): Promise<void> {
    await firstValueFrom(this.http.delete(`${URL}${id}/`));
    this.res.set(this.list().filter((g) => g.id !== id));
  }
}

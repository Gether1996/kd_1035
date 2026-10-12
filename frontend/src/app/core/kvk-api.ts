import { isPlatformBrowser } from '@angular/common';
import { HttpClient, httpResource } from '@angular/common/http';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Gear } from './armory';
import type { MarchChange } from './marches-api';

/** a player signs up for rally and garrison separately, each with its own army (Gether 11. 10. 2026) */
export type KvkRole = 'rally' | 'garrison';
export const KVK_ROLES: KvkRole[] = ['rally', 'garrison'];
/** the troops of a sign-up's army – its bonuses are read as theirs (Gether 11. 10. 2026) */
export const KVK_KINDS: MarchKind[] = ['infantry', 'cavalry', 'archer'];

/** the heading of the sign-ups – the superuser writes the date of the next KvK into it; '' = the page's own title */
export interface KvkHeading {
  title_sk: string;
  /** '' = the Slovak title */
  title_cs: string;
}

/** filled in exactly like a march (Gether 11. and 12. 10. 2026): the army of March plus the role and a note */
export interface KvkSignup extends Omit<March, 'position'> {
  role: KvkRole;
  note: string;
  updated_at: string;
  /** for reviewers */
  /** approved false: hidden from everyone but the superuser */
  player?: { id: number; name: string; ingame_name: string; avatar_url: string; discord_id: string; approved: boolean };
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

/** the armament bonuses of a march (whole %, rounded up – Gether 11. 10. 2026), read as the bonuses of its troop type */
export const ARMAMENT_STATS = ['attack', 'defense', 'health', 'damage'] as const;
/** the inscriptions of the armaments by colour, the rarest first */
export const INSCRIPTIONS = ['gold', 'blue', 'white'] as const;
export type MarchStat = (typeof ARMAMENT_STATS)[number] | (typeof INSCRIPTIONS)[number];
export const MARCH_STATS: MarchStat[] = [...ARMAMENT_STATS, ...INSCRIPTIONS];
/** All DMG may stay empty in a march: it is saved as 0 (Gether 11. 10. 2026) */
export const OPTIONAL_STATS: MarchStat[] = ['damage'];
/** required in a march (0 counts) – marches saved before they were required may still lack them; the inscription
 * counts come from the inscriptions clicked together (Gether 12. 10. 2026) */
export const REQUIRED_STATS: MarchStat[] = ['attack', 'defense', 'health'];
/** at most two digits */
export const STAT_MAX = 99;

export interface March extends Partial<Record<MarchStat, number | null>> {
  id: number;
  position: number;
  kind: MarchKind | '';
  /** commander names (backend guides/roster.py), '' = not chosen; the stats are null when not filled in */
  primary: string;
  secondary: string;
  /** the commanders' skill levels, four digits 1–5 (5555 = expertise) – a march only */
  primary_skills?: string;
  secondary_skills?: string;
  /** the build clicked together on /marche (core/armory.ts); missing in an older response */
  gear?: Gear;
  formation?: string;
  inscriptions?: string[];
}

/** a sign-up shown and edited like a march (MarchBuild, BuildEditor) */
export const asMarch = (signup: KvkSignup): March => ({ ...signup, position: 0 });

/** No rounds: a sign-up stays until the player or the superuser withdraws it (Gether 11. 10. 2026). */
export interface KvkState extends KvkHeading {
  /** the player's rally and garrison sign-ups */
  signups: Record<KvkRole, KvkSignup | null>;
  /** signed in with Discord */
  player: boolean;
  ingame_name: string;
  /** may sign up – a new player waits for the superadmin */
  approved: boolean;
  reviewer: boolean;
  superuser: boolean;
}

/** the form of a sign-up (PUT); its build goes with saveBuild (PATCH) */
export interface SignupForm {
  ingame_name: string;
  role: KvkRole;
  kind: MarchKind | '';
  primary: string;
  secondary: string;
  primary_skills: string;
  secondary_skills: string;
  note: string;
}

export interface ReviewerRow {
  id: number;
  name: string;
  ingame_name: string;
  avatar_url: string;
  /** R4: sees every KvK sign-up and every player's marches */
  reviewer: boolean;
  /** adds marches and KvK sign-ups */
  approved: boolean;
  superuser: boolean;
  /** the first sign-in */
  created_at: string;
}

/** KvK sign-ups (backend accounts/kvk_views.py); browser only, session + CSRF. */
@Injectable({ providedIn: 'root' })
export class KvkApi {
  private readonly http = inject(HttpClient);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** must run in an injection context; asked only for a signed-in player – `.reload()` after a change keeps the shown
   * value while it loads (a changed request would drop it and the page would remount its forms) */
  state(signedIn: () => boolean) {
    return httpResource<KvkState>(() => (this.isBrowser && signedIn() ? '/api/kvk/' : undefined));
  }

  saveSignup(form: SignupForm): Promise<KvkSignup> {
    return firstValueFrom(this.http.put<KvkSignup>('/api/kvk/signup/', form));
  }

  /** the player's sign-up of that role */
  withdraw(role: KvkRole): Promise<unknown> {
    return firstValueFrom(this.http.delete('/api/kvk/signup/', { params: { role } }));
  }

  /** the build of the player's sign-up of that role: equipment, formation, inscriptions, armament bonuses */
  saveBuild(role: KvkRole, change: MarchChange): Promise<KvkSignup> {
    return firstValueFrom(this.http.patch<KvkSignup>('/api/kvk/signup/', { role, ...change }));
  }

  /** every sign-up (reviewers and the superuser); must run in an injection context – `.reload()` after a change */
  signups(when: () => boolean) {
    return httpResource<{ signups: KvkSignup[] }>(() => (this.isBrowser && when() ? '/api/kvk/signups/' : undefined));
  }

  /** the superuser withdraws someone's sign-up */
  deleteSignup(id: number): Promise<unknown> {
    return firstValueFrom(this.http.delete(`/api/kvk/signups/${id}/`));
  }

  saveHeading(heading: KvkHeading): Promise<KvkHeading> {
    return firstValueFrom(this.http.put<KvkHeading>('/api/kvk/settings/', heading));
  }

  reviewers(when: () => boolean) {
    return httpResource<{ players: ReviewerRow[]; auto_approve: boolean }>(() =>
      this.isBrowser && when() ? '/api/kvk/reviewers/' : undefined,
    );
  }

  /** new players approved at their first sign-in, no Discord message to the superuser (superuser) */
  setAutoApprove(value: boolean): Promise<{ auto_approve: boolean }> {
    return firstValueFrom(
      this.http.put<{ auto_approve: boolean }>('/api/kvk/reviewers/auto-approve/', { auto_approve: value }),
    );
  }

  /** R4 and / or the approval of a player (superuser) */
  setPlayer(
    id: number,
    change: Partial<Pick<ReviewerRow, 'reviewer' | 'approved'>>,
  ): Promise<{ id: number; reviewer: boolean; approved: boolean }> {
    return firstValueFrom(
      this.http.patch<{ id: number; reviewer: boolean; approved: boolean }>(`/api/kvk/reviewers/${id}/`, change),
    );
  }
}

import { isPlatformBrowser } from '@angular/common';
import { HttpClient, httpResource } from '@angular/common/http';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { EvalPlayer } from './scoring';
import { PairRow } from './settings';

/** /api/evaluation/ (backend accounts/evaluation_views.py); superuser only, browser only */
export interface EvaluationData {
  /** null = nothing saved, the defaults count */
  settings: Record<string, unknown> | null;
  updated_at: string | null;
  /** the commander pair table – in the database (guides.CommanderPair), the best first; its version guards a save */
  pairs: PairRow[];
  pairs_version: string;
  /** commander → the formations a march he leads should use (guides.CommanderFormation, Gether 14. 10. 2026) */
  formations: Record<string, string[]>;
  players: EvalPlayer[];
}

export type SavedSettings = Pick<EvaluationData, 'settings' | 'updated_at' | 'pairs' | 'pairs_version' | 'formations'>;

export type RecordChange = Partial<Pick<EvalPlayer, 'power' | 'acclaim' | 't4' | 'power_bonus'>>;

@Injectable({ providedIn: 'root' })
export class EvaluationApi {
  private readonly http = inject(HttpClient);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** must run in an injection context */
  data(when: () => boolean) {
    return httpResource<EvaluationData>(() => (this.isBrowser && when() ? '/api/evaluation/' : undefined));
  }

  /**
   * The variables and – only when changed on the page – the whole pair table over the version it was loaded in, both
   * or nothing. The table changed meanwhile (admin, another evaluator) → 409 {pairs: 'stale'}; a commander a march
   * cannot name → 400 {pairs: 'unknown', names}. The commanders' formations go along the same way when changed.
   */
  saveSettings(
    settings: unknown,
    pairs: { rows: PairRow[]; version: string } | null,
    formations: Record<string, string[]> | null = null,
  ): Promise<SavedSettings> {
    const body = {
      settings,
      ...(pairs ? { pairs: pairs.rows, pairs_version: pairs.version } : {}),
      ...(formations ? { formations } : {}),
    };
    return firstValueFrom(this.http.put<SavedSettings>('/api/evaluation/settings/', body));
  }

  /** many players at once – all or nothing */
  saveRecords(players: (RecordChange & { id: number })[]): Promise<{ players: (RecordChange & { id: number })[] }> {
    return firstValueFrom(
      this.http.patch<{ players: (RecordChange & { id: number })[] }>('/api/evaluation/players/', { players }),
    );
  }

  saveRecord(id: number, change: RecordChange): Promise<RecordChange & { id: number }> {
    return firstValueFrom(this.http.patch<RecordChange & { id: number }>(`/api/evaluation/players/${id}/`, change));
  }
}

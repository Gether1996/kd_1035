import { isPlatformBrowser } from '@angular/common';
import { HttpClient, httpResource } from '@angular/common/http';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { EvalPlayer } from './scoring';

/** /api/evaluation/ (backend accounts/evaluation_views.py); superuser only, browser only */
export interface EvaluationData {
  /** null = nothing saved, the defaults count */
  settings: Record<string, unknown> | null;
  updated_at: string | null;
  players: EvalPlayer[];
}

export type RecordChange = Partial<Pick<EvalPlayer, 'power' | 'acclaim' | 't4' | 'power_bonus'>>;

@Injectable({ providedIn: 'root' })
export class EvaluationApi {
  private readonly http = inject(HttpClient);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** must run in an injection context */
  data(when: () => boolean) {
    return httpResource<EvaluationData>(() => (this.isBrowser && when() ? '/api/evaluation/' : undefined));
  }

  saveSettings(settings: unknown): Promise<Pick<EvaluationData, 'settings' | 'updated_at'>> {
    return firstValueFrom(
      this.http.put<Pick<EvaluationData, 'settings' | 'updated_at'>>('/api/evaluation/settings/', { settings }),
    );
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

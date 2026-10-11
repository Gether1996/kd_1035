import { isPlatformBrowser } from '@angular/common';
import { HttpClient, httpResource } from '@angular/common/http';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { March, MarchImage, MarchKind, UploadError, uploadError } from './kvk-api';

export type MarchChange = Partial<{ kind: MarchKind | ''; primary: string; secondary: string }>;

/** The player's marches on /ucet (backend accounts/march_views.py); browser only, session + CSRF. */
@Injectable({ providedIn: 'root' })
export class MarchesApi {
  private readonly http = inject(HttpClient);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** must run in an injection context */
  list() {
    return httpResource<{ marches: March[]; max: number }>(() => (this.isBrowser ? '/api/me/marches/' : undefined));
  }

  add(): Promise<March> {
    return firstValueFrom(this.http.post<March>('/api/me/marches/', {}));
  }

  update(id: number, change: MarchChange): Promise<March> {
    return firstValueFrom(this.http.patch<March>(`/api/me/marches/${id}/`, change));
  }

  remove(id: number): Promise<unknown> {
    return firstValueFrom(this.http.delete(`/api/me/marches/${id}/`));
  }

  async upload(id: number, kind: MarchImage['kind'], file: File): Promise<MarchImage | UploadError> {
    const body = new FormData();
    body.append('kind', kind);
    body.append('file', file);
    try {
      return await firstValueFrom(this.http.post<MarchImage>(`/api/me/marches/${id}/images/`, body));
    } catch (e) {
      return uploadError(e);
    }
  }

  removeImage(id: number): Promise<unknown> {
    return firstValueFrom(this.http.delete(`/api/me/marches/images/${id}/`));
  }
}

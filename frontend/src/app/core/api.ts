import { isPlatformBrowser } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Injectable, PLATFORM_ID, computed, inject } from '@angular/core';

export interface Officer {
  name: string;
  title_sk: string;
  title_cs: string;
  discord_id: string;
  discord_username: string;
}

export interface Alliance {
  id: number;
  tag: string;
  name: string;
  officers: Officer[];
}

export type Platform = 'discord' | 'facebook';

export interface SiteStatus {
  /** ISO date of the latest information: monthly meta check or a guide change */
  updated: string;
  meta_verified: string;
}

export interface SocialLink {
  platform: Platform;
  url: string;
}

/**
 * Content managed in the Django admin. Every value falls back to empty when the API is down.
 * Only fetched in the browser – prerendered pages are built without the backend.
 */
@Injectable({ providedIn: 'root' })
export class KingdomApi {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly alliancesRes = httpResource<Alliance[]>(() => (this.isBrowser ? '/api/alliances/' : undefined));
  private readonly linksRes = httpResource<SocialLink[]>(() => (this.isBrowser ? '/api/links/' : undefined));
  private readonly statusRes = httpResource<SiteStatus>(() => (this.isBrowser ? '/api/status/' : undefined));

  readonly alliances = computed(() => (this.alliancesRes.hasValue() ? this.alliancesRes.value() : []));
  /** True when the API failed or returned nothing – the alliance section is then hidden. */
  readonly alliancesFailed = computed(
    () => !!this.alliancesRes.error() || (this.alliancesRes.hasValue() && this.alliancesRes.value().length === 0),
  );
  readonly links = computed(() => {
    const links = this.linksRes.hasValue() ? this.linksRes.value() : [];
    return Object.fromEntries(links.map((l) => [l.platform, l.url])) as Partial<Record<Platform, string>>;
  });
  /** Footer "information updated on" – null while loading, during prerendering and when the API failed. */
  readonly updated = computed(() => (this.statusRes.hasValue() ? this.statusRes.value().updated : null));
}

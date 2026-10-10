import { isPlatformBrowser } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Injectable, PLATFORM_ID, computed, inject } from '@angular/core';
import { GuideCategory, I18n } from './i18n/i18n';

/** Commander specialty a guide is about (troop type or scenario) – shown as its in-game tag in the list; for the fort
 * tips the fort emblem. */
export type GuideSpecialty =
  | 'cavalry'
  | 'infantry'
  | 'archer'
  | 'leadership'
  | 'garrison'
  | 'conquering'
  | 'peacekeeping'
  | 'gathering'
  | 'barbarian-fort';

export interface GuideSummary {
  slug: string;
  category: GuideCategory;
  specialty: GuideSpecialty | '';
  /** the game's tag of the specialty (/static/guides/specialties/<specialty>.webp), null without one */
  specialty_icon: string | null;
  title_sk: string;
  title_cs: string;
  excerpt_sk: string;
  excerpt_cs: string;
  updated_at: string;
}

/** A kingdom event linked to the guide with its running or next run (the calendar's rule). */
export interface GuideEvent {
  id: number;
  name_sk: string;
  /** '' = the Slovak name is shown */
  name_cs: string;
  icon: string | null;
  /** ISO 8601 in UTC; null = an irregular event whose next date is not announced yet */
  start: string | null;
  /** null = no end (duration 0) */
  end: string | null;
  irregular: boolean;
  repeat_days: number;
}

export interface GuideDetail extends GuideSummary {
  html_sk: string;
  html_cs: string;
  /** at most 4, soonest first; missing or empty = no "V kalendári" card */
  events?: GuideEvent[];
}

/** Guides written by the superadmin in the Django admin. Czech fields fall back to Slovak. */
@Injectable({ providedIn: 'root' })
export class GuidesApi {
  private readonly i18n = inject(I18n);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly listRes = httpResource<GuideSummary[]>(() => (this.isBrowser ? '/api/guides/' : undefined));

  /** false while loading and during prerendering (the list is fetched in the browser) */
  readonly ready = computed(() => this.listRes.hasValue());
  readonly failed = computed(() => !!this.listRes.error());
  readonly all = computed(() => (this.listRes.hasValue() ? this.listRes.value() : []));

  byCategory(category: GuideCategory): GuideSummary[] {
    return this.all().filter((g) => g.category === category);
  }

  title(g: GuideSummary): string {
    return (this.i18n.lang() === 'cs' && g.title_cs) || g.title_sk;
  }

  excerpt(g: GuideSummary): string {
    return this.i18n.lang() === 'cs' ? g.excerpt_cs : g.excerpt_sk;
  }

  html(g: GuideDetail): string {
    return (this.i18n.lang() === 'cs' && g.html_cs) || g.html_sk;
  }

  /** "3 návody" / "5 návodov" (SK) · "5 návodů" (CZ) */
  count(n: number): string {
    const forms = this.i18n.t().guides.count;
    const rule = new Intl.PluralRules(this.i18n.lang()).select(n);
    return `${n} ${rule === 'one' ? forms.one : rule === 'few' ? forms.few : forms.other}`;
  }

  date(iso: string): string {
    return new Intl.DateTimeFormat(this.i18n.locale(), { day: 'numeric', month: 'long', year: 'numeric' }).format(
      new Date(iso),
    );
  }
}

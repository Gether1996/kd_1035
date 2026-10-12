import { isPlatformBrowser } from '@angular/common';
import { httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { Auth } from '../../core/auth';
import { I18n } from '../../core/i18n/i18n';
import { MARCH_KINDS, MarchKind } from '../../core/kvk-api';
import { MarchCommander, MarchesApi, PlayerMarches, marchCommandersUrl } from '../../core/marches-api';
import { Seo } from '../../core/seo';
import { Icon } from '../../shared/icon';
import { MarchBuild } from '../../shared/march-build';
import { PageHeader } from '../../shared/page-header';
import { PendingApproval } from '../../shared/pending-approval';
import { reloadOnReturn } from '../../shared/reload-on-return';
import { fold } from '../../shared/search';
import { Marches } from '../account/marches';

type Sort = 'updated' | 'count' | 'name';

/**
 * /marche – two tabs (Gether 11. 10. 2026): "Marche hráčov" = the marches of the players who made them public ("aby to
 * mali ako motiváciu"; R4 and the superuser see every player's), "Prehľad marchov" (?tab=prehlad, the old ?tab=moje
 * too) = the player's own marches (the Marches component; Gether 12. 10. 2026: "Moje marche" merged into it). Both
 * show each march as a card with its equipment and armaments (MarchBuild). Signed-in players only; a prerendered shell,
 * not indexed, not in the sitemap.
 */
@Component({
  selector: 'app-players-marches',
  imports: [Icon, PageHeader, Marches, MarchBuild, PendingApproval],
  templateUrl: './players-marches.html',
  styleUrls: ['../reminders/reminders-page.scss', './players-marches.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlayersMarches {
  /** ?tab=prehlad – the player's own marches (the old ?tab=moje leads there too) */
  readonly tab = input<string>();

  protected readonly i18n = inject(I18n);
  private readonly router = inject(Router);
  /** the player's marches with their equipment and armaments – "Moje marche" merged into it (Gether 12. 10. 2026) */
  protected readonly mine = computed(() => this.tab() === 'prehlad' || this.tab() === 'moje');
  protected readonly auth = inject(Auth);
  protected readonly t = this.i18n.t;

  protected readonly data = inject(MarchesApi).players(() => !!this.auth.user()?.approved);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly commanderData = httpResource<MarchCommander[]>(() => (this.isBrowser ? marchCommandersUrl : undefined));
  protected readonly portraits = computed(
    () => new Map((this.commanderData.hasValue() ? this.commanderData.value() : []).map((c) => [c.name, c.icon])),
  );

  protected readonly search = signal('');
  /** the most recently changed first (Gether 12. 10. 2026), the most marches, or the name */
  protected readonly sorts: Sort[] = ['updated', 'count', 'name'];
  protected readonly sort = signal<Sort>('updated');
  /** only the players with a march of this type ('' = all) */
  protected readonly kinds = MARCH_KINDS;
  protected readonly kind = signal<MarchKind | ''>('');
  protected readonly players = computed(() => (this.data.hasValue() ? this.data.value().players : []));
  protected readonly shown = computed(() => {
    const query = fold(this.search());
    const kind = this.kind();
    const byName = (a: PlayerMarches, b: PlayerMarches) => this.name(a).localeCompare(this.name(b), this.i18n.locale());
    const order: Record<Sort, (a: PlayerMarches, b: PlayerMarches) => number> = {
      updated: (a, b) => b.updated_at.localeCompare(a.updated_at) || byName(a, b),
      count: (a, b) => b.marches.length - a.marches.length || byName(a, b),
      name: byName,
    };
    return this.players()
      .filter((p) => !query || fold(`${p.ingame_name} ${p.name}`).includes(query))
      .filter((p) => !kind || p.marches.some((m) => m.kind === kind))
      .sort(order[this.sort()]);
  });

  /** players whose marches are open – all closed at first, a list of names is quicker to scan */
  protected readonly opened = signal<ReadonlySet<number>>(new Set());
  protected readonly allOpen = computed(() => {
    const opened = this.opened();
    return this.shown().length > 0 && this.shown().every((p) => opened.has(p.id));
  });

  protected readonly crumbs = computed(() => [
    { label: this.t().nav.home, link: this.i18n.path('home') },
    { label: this.t().playersMarches.title, link: this.i18n.path('playersMarches') },
  ]);

  constructor() {
    // other players change their marches and sign-ups: the list asks again when the visitor comes back to the tab
    reloadOnReturn(() => {
      // also after a failed load (a phone back before its network) – the next return tries again
      if (!this.data.isLoading() && (this.data.hasValue() || this.data.error())) this.data.reload();
    });
    // the old address of the own marches (?tab=moje) shows the overview's
    effect(() => {
      if (this.tab() === 'moje') this.showTab('prehlad');
    });
    const seo = inject(Seo);
    effect(() => seo.set({ ...this.t().seo.playersMarches, noindex: true }));
    inject(DestroyRef).onDestroy(() => seo.set(null));
  }

  protected showTab(tab: 'prehlad' | null): void {
    // back on the players' marches after editing the own ones: the list asks again
    if (!tab && this.mine() && !this.data.isLoading()) this.data.reload();
    void this.router.navigate([], { queryParams: { tab }, replaceUrl: true });
  }

  protected isOpen(id: number): boolean {
    return this.opened().has(id);
  }

  protected toggle(id: number): void {
    this.opened.update((opened) => {
      const next = new Set(opened);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  /** "Rozbaliť všetky" / "Zbaliť všetky" – the players the search shows */
  protected toggleAll(): void {
    this.opened.set(this.allOpen() ? new Set() : new Set(this.shown().map((p) => p.id)));
  }

  /** "6 marchov" */
  protected count(n: number): string {
    const [one, few, many] = this.t().playersMarches.count;
    return (n === 1 ? one : n >= 2 && n <= 4 ? few : many).replace('{n}', String(n));
  }

  protected name(player: PlayerMarches): string {
    return player.ingame_name || player.name;
  }

  protected setSort(value: string): void {
    this.sort.set(value as Sort);
  }

  protected setKind(value: string): void {
    this.kind.set(value as MarchKind | '');
  }

  /** "upravené 12. 10." – when one of the player's marches changed last */
  protected updated(iso: string): string {
    const date = new Intl.DateTimeFormat(this.i18n.locale(), { day: 'numeric', month: 'numeric' }).format(new Date(iso));
    return this.t().playersMarches.updated.replace('{date}', date);
  }
}

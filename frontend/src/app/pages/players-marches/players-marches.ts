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
  linkedSignal,
  signal,
  untracked,
} from '@angular/core';
import { Router } from '@angular/router';
import { Auth } from '../../core/auth';
import { I18n } from '../../core/i18n/i18n';
import { KINGDOM_ZONE } from '../../core/kingdom-zone';
import { MARCH_KINDS, MarchKind, marchHasProblem } from '../../core/kvk-api';
import { MarchCommander, MarchesApi, PlayerMarches, marchCommandersUrl } from '../../core/marches-api';
import { Seo } from '../../core/seo';
import { CommanderFilter, marchCommanders } from '../../shared/commander-filter';
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
  imports: [Icon, PageHeader, Marches, MarchBuild, PendingApproval, CommanderFilter],
  templateUrl: './players-marches.html',
  styleUrls: ['../reminders/reminders-page.scss', './players-marches.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlayersMarches {
  /** ?tab=prehlad – the player's own marches (the old ?tab=moje leads there too) */
  readonly tab = input<string>();
  /** ?cmd=Attila – only the players with a march of this commander (a shareable link, kept across the tabs) */
  readonly cmd = input<string>();

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
  /** only the players with a march of this commander, primary or secondary ('' = all; "who has Attila for rally?") */
  protected readonly commander = linkedSignal(() => this.cmd() ?? '');
  protected readonly players = computed(() => (this.data.hasValue() ? this.data.value().players : []));
  protected readonly commanders = computed(() => marchCommanders(this.players().flatMap((p) => p.marches)));
  protected readonly shown = computed(() => {
    const query = fold(this.search());
    const kind = this.kind();
    const commander = this.commander();
    // the type and the commander of one and the same march: a cavalry march with Attila, not any cavalry and any Attila
    const fits = (m: PlayerMarches['marches'][number]) =>
      (!kind || m.kind === kind) && (!commander || m.primary === commander || m.secondary === commander);
    const byName = (a: PlayerMarches, b: PlayerMarches) => this.name(a).localeCompare(this.name(b), this.i18n.locale());
    const order: Record<Sort, (a: PlayerMarches, b: PlayerMarches) => number> = {
      updated: (a, b) => b.updated_at.localeCompare(a.updated_at) || byName(a, b),
      count: (a, b) => b.marches.length - a.marches.length || byName(a, b),
      name: byName,
    };
    return this.players()
      .filter((p) => !query || fold(`${p.ingame_name} ${p.name}`).includes(query))
      .filter((p) => (!kind && !commander) || p.marches.some(fits))
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
    // a newly chosen commander opens the players who have them – once, a card closed by hand afterwards stays closed
    // (a reload of the list on return keeps what the visitor opened and closed)
    let expandedFor = '';
    effect(() => {
      const commander = this.commander();
      if (!this.data.hasValue() || commander === expandedFor) return;
      expandedFor = commander;
      if (commander) this.opened.set(new Set(untracked(this.shown).map((p) => p.id)));
    });
    const seo = inject(Seo);
    effect(() => seo.set({ ...this.t().seo.playersMarches, noindex: true }));
    inject(DestroyRef).onDestroy(() => seo.set(null));
  }

  protected showTab(tab: 'prehlad' | null): void {
    // back on the players' marches after editing the own ones: the list asks again
    if (!tab && this.mine() && !this.data.isLoading()) this.data.reload();
    // merged: the tabs keep ?cmd= and the commander keeps ?tab=
    void this.router.navigate([], { queryParams: { tab }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  /** the commander filter in the address (?cmd=), so a reload or a shared link shows the same players */
  protected setCommander(name: string): void {
    this.commander.set(name);
    void this.router.navigate([], { queryParams: { cmd: name || null }, queryParamsHandling: 'merge', replaceUrl: true });
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

  /** a march the KvK evaluation does not like (Gether 14. 10. 2026: it shows on a closed player too) */
  protected readonly bad = marchHasProblem;

  protected problems(player: PlayerMarches): number {
    return player.marches.filter(marchHasProblem).length;
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

  /** "upravené 12. 10. 14:32" – when one of the player's marches changed last, in the kingdom's time (Gether 12. 10. 2026) */
  protected updated(iso: string): string {
    const date = new Intl.DateTimeFormat(this.i18n.locale(), {
      day: 'numeric',
      month: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: KINGDOM_ZONE,
    }).format(new Date(iso));
    return this.t().playersMarches.updated.replace('{date}', date);
  }
}

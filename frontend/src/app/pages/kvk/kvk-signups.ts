import { ViewportScroller, isPlatformBrowser } from '@angular/common';
import { HttpResourceRef, httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  PLATFORM_ID,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ArmoryApi } from '../../core/armory';
import { I18n } from '../../core/i18n/i18n';
import { KINGDOM_ZONE } from '../../core/kingdom-zone';
import {
  KVK_KINDS,
  KVK_ONLINE,
  KvkApi,
  KvkOnline,
  KvkSignup,
  KvkSignupList,
  MarchKind,
  asMarch,
  marchIcon,
  surveyMissing,
} from '../../core/kvk-api';
import { normalizeSettings } from '../evaluation/settings';
import { MarchCommander, marchCommandersUrl } from '../../core/marches-api';
import { CommanderFilter, marchCommanders } from '../../shared/commander-filter';
import { copyText } from '../../shared/copy-link';
import { Icon } from '../../shared/icon';
import { MarchBuild } from '../../shared/march-build';
import { rosterText } from './roster-text';
import { topSignups } from './top';
import { surveyText } from './survey';

type Role = 'all' | 'rally' | 'garrison';

/** the card a sign-up belongs to: its player (a sign-up without one – never sent today – is a card of its own) */
const keyOf = (signup: KvkSignup) => signup.player?.id ?? -signup.id;
/** how many players (cards) these sign-ups are */
const players = (signups: KvkSignup[]) => new Set(signups.map(keyOf)).size;
/** ?online= of the address: a key of the survey, anything else = everyone */
const onlineOf = (query: string | undefined): KvkOnline | 'all' => KVK_ONLINE.find((key) => key === query) ?? 'all';

/**
 * "Prihlášky" on /kvk for the reviewers (R4) and the superuser: one card per player (Gether 11. 10. 2026: a player
 * signed up for rally and garrison is one card, not two) with the name, contact and profile marches once and each of
 * their sign-ups below – role, the army as the card of a march (equipment, armaments, bonuses – no screenshots since
 * 12. 10. 2026), note; the profile marches as cards too. The
 * filters (role, troops, commander, when online) keep the sign-ups that match; the superuser may withdraw a sign-up.
 * "Kopírovať pre Discord" copies what the filters show as a roster for the leadership's Discord (roster-text.ts) –
 * without the survey (Gether has not decided yet whether the times go to Discord). ?online= is in the address, ?hrac=
 * opens a player's card and scrolls to it once; an open card links to the player's marches and "Top 5 equip".
 */
@Component({
  selector: 'app-kvk-signups',
  imports: [RouterLink, Icon, MarchBuild, CommanderFilter],
  templateUrl: './kvk-signups.html',
  styleUrls: ['./kvk.scss', './kvk-signups.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KvkSignups {
  /** every sign-up – loaded by the page, which asks again after a change */
  readonly data = input.required<HttpResourceRef<KvkSignupList | undefined>>();
  /** the superuser may withdraw a sign-up */
  readonly superuser = input(false);
  /** ?online= of the page – the filter by the survey's times (a shared link shows the same players) */
  readonly online = input<string>();
  /** ?hrac= of the page – that player's card opens, is highlighted and scrolled to once */
  readonly focus = input<number | null>(null);
  /** false when the page came back from the history – App puts it where the visitor left it, no scroll to ?hrac= */
  readonly scrollToFocus = input(true);
  /** the visitor opens /vyhodnocovanie (Auth.canEvaluate, as the account menu) – an open card links to "Top 5 equip" */
  readonly canEvaluate = input(false);
  readonly changed = output<void>();

  private readonly api = inject(KvkApi);
  private readonly router = inject(Router);
  protected readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.t().kvk);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  /** the portraits of the players' marches */
  private readonly commanderData = httpResource<MarchCommander[]>(() => (this.isBrowser ? marchCommandersUrl : undefined));
  protected readonly portraits = computed(
    () => new Map((this.commanderData.hasValue() ? this.commanderData.value() : []).map((c) => [c.name, c.icon])),
  );

  protected readonly role = signal<Role>('all');
  /** the troops filter (Gether 11. 10. 2026), combined with the role */
  protected readonly troops = signal<MarchKind | 'all'>('all');
  protected readonly troopKinds = KVK_KINDS;
  protected readonly icon = marchIcon;
  // value() throws while the resource is in an error state – the list then shows its error text
  protected readonly all = computed(() => (this.data().hasValue() ? this.data().value()!.signups : []));
  /** the sign-up whose withdraw waits for the second click */
  protected readonly armed = signal<number | null>(null);
  protected readonly failed = signal(false);
  /** only the sign-ups with this commander, primary or secondary ('' = all; "who can garrison with Gorgo?") */
  protected readonly commander = signal('');
  protected readonly commanders = computed(() => marchCommanders(this.all()));
  /** when the players are online – one key of the survey (Gether 20. 10. 2026: "kedy je online"), in ?online= */
  protected readonly onlineKeys = KVK_ONLINE;
  protected readonly onlineFilter = linkedSignal(() => onlineOf(this.online()));
  /** each player's times: one survey for both sign-ups, from the first that has it (as on the card) */
  private readonly onlineByPlayer = computed(() => {
    const times = new Map<number, readonly KvkOnline[]>();
    for (const s of this.all()) if (!times.has(keyOf(s)) && !surveyMissing(s)) times.set(keyOf(s), s.online);
    return times;
  });
  private readonly isOnline = (s: KvkSignup, key: KvkOnline) => !!this.onlineByPlayer().get(keyOf(s))?.includes(key);
  /** the sign-ups of the chosen commander */
  private readonly ofCommander = computed(() => {
    const commander = this.commander();
    return this.all().filter((s) => !commander || s.primary === commander || s.secondary === commander);
  });
  /** …and of the chosen time online – the role and troops counts are of these */
  private readonly ofOnline = computed(() => {
    const online = this.onlineFilter();
    return this.ofCommander().filter((s) => online === 'all' || this.isOnline(s, online));
  });
  /** the sign-ups of the chosen role – the troops counts are of these */
  private readonly ofRole = computed(() => {
    const role = this.role();
    return this.ofOnline().filter((s) => role === 'all' || s.role === role);
  });
  protected readonly shown = computed(() => {
    const troops = this.troops();
    return this.ofRole().filter((s) => troops === 'all' || s.kind === troops);
  });
  /** the shown sign-ups by player, in the order of the list (by name, rally before garrison) */
  protected readonly players = computed(() => {
    const groups = new Map<number, KvkSignup[]>();
    for (const s of this.shown()) {
      const key = keyOf(s);
      groups.set(key, [...(groups.get(key) ?? []), s]);
    }
    return [...groups.entries()].map(([key, signups]) => ({
      key,
      first: signups[0],
      signups,
      updated: signups.map((s) => s.updated_at).sort().at(-1)!,
    }));
  });
  /** each sign-up as the card of a march */
  protected readonly asMarch = asMarch;
  /** the survey of a player – how much into the KvK, when online (Gether 20. 10. 2026); one for both sign-ups, taken
   * from the first that has it; null = none (a sign-up from before it) */
  protected surveyOfPlayer(signups: KvkSignup[]): { budget: string; online: string } | null {
    const filled = signups.find((s) => !surveyMissing(s));
    return filled ? surveyText(filled, this.t().survey) : null;
  }
  /** the numbers on the filters count players (one card each), like the list below */
  protected readonly counts = computed(() => ({
    all: players(this.ofOnline()),
    rally: players(this.ofOnline().filter((s) => s.role === 'rally')),
    garrison: players(this.ofOnline().filter((s) => s.role === 'garrison')),
  }));
  /** the times online count the players the other filters (commander, role, troops) leave */
  protected readonly onlineCounts = computed(() => {
    const role = this.role();
    const troops = this.troops();
    const base = this.ofCommander().filter((s) => (role === 'all' || s.role === role) && (troops === 'all' || s.kind === troops));
    const counts: Record<string, number> = { all: players(base) };
    for (const key of KVK_ONLINE) counts[key] = players(base.filter((s) => this.isOnline(s, key)));
    return counts;
  });
  protected readonly troopCounts = computed(() => {
    const counts: Record<string, number> = { all: players(this.ofRole()) };
    for (const kind of KVK_KINDS) counts[kind] = players(this.ofRole().filter((s) => s.kind === kind));
    return counts;
  });

  /** the players whose sign-ups are open – closed at first, like the players on /marche (Gether 20. 10. 2026) */
  protected readonly opened = signal<ReadonlySet<number>>(new Set());
  protected readonly allOpen = computed(() => {
    const opened = this.opened();
    return this.players().length > 0 && this.players().every((g) => opened.has(g.key));
  });

  private disarm?: ReturnType<typeof setTimeout>;

  private readonly armory = inject(ArmoryApi);
  private readonly injector = inject(Injector);
  private readonly scroller = inject(ViewportScroller);
  /**
   * "Top 3" of each troop type above the list (Gether 23. 10. 2026: like "Top 5 equip"): the sign-ups the role,
   * commander and online filters leave, scored by their own equipment and armaments; empty until the armory loads
   */
  protected readonly top = computed(() => {
    const index = this.armory.index();
    if (!index) return [];
    const settings = normalizeSettings(this.data().hasValue() ? this.data().value()!.settings : null);
    return KVK_KINDS.map((kind) => ({ kind, best: topSignups(this.ofRole(), settings, index, kind) }));
  });
  protected readonly hasTop = computed(() => this.top().some((t) => t.best.length));

  /** a player of the "Top 3": their card opens and the page scrolls to it */
  protected showPlayer(id: number): void {
    this.opened.update((opened) => new Set(opened).add(id));
    afterNextRender({ read: () => this.scroller.scrollToAnchor(`kvk-player-${id}`) }, { injector: this.injector });
  }

  protected score(total: number): string {
    return new Intl.NumberFormat(this.i18n.locale(), { maximumFractionDigits: 1 }).format(total);
  }
  /** the shown sign-ups as Discord messages (one, or parts of at most 1900 characters) */
  protected readonly roster = computed(() => {
    const t = this.i18n.t();
    const formations = this.armory.index()?.formations;
    return rosterText(this.shown(), {
      kinds: t.marches.kinds,
      noKind: t.kvk.roster.noKind,
      formation: (id) => formations?.get(id)?.name ?? '',
    });
  });
  /** the part just copied (its text, so a change of the filters hides the confirmation) */
  protected readonly copied = signal<string | null>(null);
  /** the part to copy by hand when the clipboard is denied */
  protected readonly manual = signal('');
  private readonly manualField = viewChild<ElementRef<HTMLTextAreaElement>>('manualField');
  private copiedTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    // "who can garrison with Gorgo?": a picked commander opens the players it leaves, as on /marche
    effect(() => {
      if (this.commander()) this.opened.set(new Set(untracked(this.players).map((g) => g.key)));
    });
    // ?hrac= (a link from "Top 5 equip"): the player's card opens once the list is there and the page scrolls to it
    // once – one render after it, no timers; back/forward is left to App, which puts the page where the visitor left it
    const injector = inject(Injector);
    const scroller = inject(ViewportScroller);
    let scroll: boolean | undefined;
    let openedFor: number | null = null;
    effect(() => {
      const id = this.focus();
      // decided with the address the list was opened with
      scroll ??= untracked(this.scrollToFocus);
      if (id === null || id === openedFor || !this.players().some((g) => g.key === id)) return;
      openedFor = id;
      this.opened.update((opened) => new Set(opened).add(id));
      if (!scroll) return;
      scroll = false;
      afterNextRender({ read: () => scroller.scrollToAnchor(`kvk-player-${id}`) }, { injector });
    });
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.copiedTimer);
      clearTimeout(this.disarm);
    });
  }

  /** the time online in the address without a new history entry; the other query (?tab=, ?hrac=) stays */
  protected setOnline(value: string): void {
    const online = onlineOf(value);
    this.onlineFilter.set(online);
    this.armed.set(null);
    void this.router.navigate([], {
      queryParams: { online: online === 'all' ? null : online },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected isOpen(key: number): boolean {
    return this.opened().has(key);
  }

  protected toggle(key: number): void {
    this.opened.update((opened) => {
      const next = new Set(opened);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  /** "Rozbaliť všetky" / "Zbaliť všetky" – the players the filters show */
  protected toggleAll(): void {
    this.opened.set(this.allOpen() ? new Set() : new Set(this.players().map((g) => g.key)));
  }

  /** No `await` before copyText(): the clipboard needs the click's user activation. */
  protected copy(index: number): void {
    const text = this.roster()[index];
    if (!text) return;
    copyText(text).then((done) => {
      clearTimeout(this.copiedTimer);
      this.copied.set(done ? text : null);
      this.manual.set(done ? '' : text);
      if (done) {
        this.copiedTimer = setTimeout(() => this.copied.set(null), 4000);
        return;
      }
      afterNextRender(
        () => {
          const field = this.manualField()?.nativeElement;
          field?.focus();
          field?.select();
        },
        { injector: this.injector },
      );
    });
  }

  /** the label of a part: "Časť 1/2" */
  protected part(index: number): string {
    return this.t()
      .roster.part.replace('{i}', String(index + 1))
      .replace('{n}', String(this.roster().length));
  }

  /** the first click arms "Zrušiť prihlášku" for a few seconds, the second withdraws someone else's sign-up */
  protected async remove(signup: KvkSignup): Promise<void> {
    clearTimeout(this.disarm);
    if (this.armed() !== signup.id) {
      this.armed.set(signup.id);
      this.disarm = setTimeout(() => this.armed.set(null), 5000);
      return;
    }
    this.armed.set(null);
    this.failed.set(false);
    try {
      await this.api.deleteSignup(signup.id);
      this.changed.emit();
    } catch {
      this.failed.set(true);
    }
  }

  protected name(signup: KvkSignup): string {
    return signup.player?.ingame_name || signup.player?.name || '';
  }

  protected date(iso: string): string {
    return new Intl.DateTimeFormat(this.i18n.locale(), {
      day: 'numeric',
      month: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: KINGDOM_ZONE,
    }).format(new Date(iso));
  }
}

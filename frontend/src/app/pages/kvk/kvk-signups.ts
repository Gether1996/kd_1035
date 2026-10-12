import { isPlatformBrowser } from '@angular/common';
import { HttpResourceRef, httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { I18n } from '../../core/i18n/i18n';
import { KINGDOM_ZONE } from '../../core/kingdom-zone';
import { KVK_KINDS, KvkApi, KvkSignup, MarchKind, asMarch, marchIcon } from '../../core/kvk-api';
import { MarchCommander, marchCommandersUrl } from '../../core/marches-api';
import { CommanderFilter, marchCommanders } from '../../shared/commander-filter';
import { Icon } from '../../shared/icon';
import { MarchBuild } from '../../shared/march-build';

type Role = 'all' | 'rally' | 'garrison';

/** how many players (cards) these sign-ups are */
const players = (signups: KvkSignup[]) => new Set(signups.map((s) => s.player?.id ?? -s.id)).size;

/**
 * "Prihlášky" on /kvk for the reviewers (R4) and the superuser: one card per player (Gether 11. 10. 2026: a player
 * signed up for rally and garrison is one card, not two) with the name, contact and profile marches once and each of
 * their sign-ups below – role, the army as the card of a march (equipment, armaments, bonuses – no screenshots since
 * 12. 10. 2026), note; the profile marches as cards too. The
 * filters (role, troops, commander) keep the sign-ups that match; the superuser may withdraw a sign-up.
 */
@Component({
  selector: 'app-kvk-signups',
  imports: [Icon, MarchBuild, CommanderFilter],
  templateUrl: './kvk-signups.html',
  styleUrl: './kvk.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KvkSignups {
  /** every sign-up – loaded by the page, which asks again after a change */
  readonly data = input.required<HttpResourceRef<{ signups: KvkSignup[] } | undefined>>();
  /** the superuser may withdraw a sign-up */
  readonly superuser = input(false);
  readonly changed = output<void>();

  private readonly api = inject(KvkApi);
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
  /** the sign-ups of the chosen commander – the role and troops counts are of these */
  private readonly ofCommander = computed(() => {
    const commander = this.commander();
    return this.all().filter((s) => !commander || s.primary === commander || s.secondary === commander);
  });
  /** the sign-ups of the chosen role – the troops counts are of these */
  private readonly ofRole = computed(() => {
    const role = this.role();
    return this.ofCommander().filter((s) => role === 'all' || s.role === role);
  });
  protected readonly shown = computed(() => {
    const troops = this.troops();
    return this.ofRole().filter((s) => troops === 'all' || s.kind === troops);
  });
  /** the shown sign-ups by player, in the order of the list (by name, rally before garrison) */
  protected readonly players = computed(() => {
    const groups = new Map<number, KvkSignup[]>();
    for (const s of this.shown()) {
      const key = s.player?.id ?? -s.id;
      groups.set(key, [...(groups.get(key) ?? []), s]);
    }
    return [...groups.values()].map((signups) => ({
      first: signups[0],
      signups,
      updated: signups.map((s) => s.updated_at).sort().at(-1)!,
    }));
  });
  /** each sign-up as the card of a march */
  protected readonly asMarch = asMarch;
  /** the numbers on the filters count players (one card each), like the list below */
  protected readonly counts = computed(() => ({
    all: players(this.ofCommander()),
    rally: players(this.ofCommander().filter((s) => s.role === 'rally')),
    garrison: players(this.ofCommander().filter((s) => s.role === 'garrison')),
  }));
  protected readonly troopCounts = computed(() => {
    const counts: Record<string, number> = { all: players(this.ofRole()) };
    for (const kind of KVK_KINDS) counts[kind] = players(this.ofRole().filter((s) => s.kind === kind));
    return counts;
  });

  private disarm?: ReturnType<typeof setTimeout>;

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

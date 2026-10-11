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
import { KVK_KINDS, KvkApi, KvkSignup, MARCH_STATS, March, MarchKind, marchIcon } from '../../core/kvk-api';
import { MarchCommander, marchCommandersUrl } from '../../core/marches-api';
import { Icon } from '../../shared/icon';
import { MarchRow } from '../../shared/march-row';

type Role = 'all' | 'rally' | 'garrison';

/**
 * "Prihlášky" on /kvk for the reviewers (R4) and the superuser: one card per player (Gether 11. 10. 2026: a player
 * signed up for rally and garrison is one card, not two) with the name, contact and profile marches once and each of
 * their sign-ups below – role, the army as a march row (a thumbnail opens its screenshot in a dialog), note. The
 * filters keep the sign-ups that match; the superuser may withdraw a sign-up.
 */
@Component({
  selector: 'app-kvk-signups',
  imports: [Icon, MarchRow],
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
  protected readonly all = computed(() => this.data().value()?.signups ?? []);
  /** the sign-up whose withdraw waits for the second click */
  protected readonly armed = signal<number | null>(null);
  protected readonly failed = signal(false);
  /** the sign-ups of the chosen role – the troops counts are of these */
  private readonly ofRole = computed(() => {
    const role = this.role();
    return this.all().filter((s) => role === 'all' || s.role === role);
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
  /** each sign-up as a row like a march (no type, no number) */
  protected readonly armies = computed(
    () =>
      new Map(
        this.all().map((s): [number, March] => {
          const stats = Object.fromEntries(MARCH_STATS.map((stat) => [stat, s[stat] ?? null]));
          return [s.id, { id: s.id, position: 0, kind: s.kind, primary: s.primary, secondary: s.secondary, images: s.images, ...stats }];
        }),
      ),
  );
  protected readonly counts = computed(() => ({
    all: this.all().length,
    rally: this.all().filter((s) => s.role === 'rally').length,
    garrison: this.all().filter((s) => s.role === 'garrison').length,
  }));
  protected readonly troopCounts = computed(() => {
    const counts: Record<string, number> = { all: this.ofRole().length };
    for (const kind of KVK_KINDS) counts[kind] = this.ofRole().filter((s) => s.kind === kind).length;
    return counts;
  });


  protected async remove(signup: KvkSignup): Promise<void> {
    if (this.armed() !== signup.id) {
      this.armed.set(signup.id);
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
    }).format(new Date(iso));
  }
}

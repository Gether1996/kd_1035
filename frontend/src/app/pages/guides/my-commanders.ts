import { isPlatformBrowser } from '@angular/common';
import { httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { GuideCategory, I18n } from '../../core/i18n/i18n';
import { Icon } from '../../shared/icon';
import { fold } from '../../shared/search';
import { CommanderRef, IndexedCommander, commanderKey } from './commander-finder';
import { shownCommander } from './hidden-commanders';

/** The owned commanders (their keys) – only in this browser, never sent anywhere (privacy page). */
export const OWNED_KEY = 'kd1035.commanders';
/** how many "one commander missing" suggestions are shown */
const SUGGESTIONS = 6;

/** A pair of a guide: the primary commander and the secondary (null = anyone). */
export interface Pair {
  key: string;
  primary: CommanderRef;
  secondary: CommanderRef | null;
  guides: { slug: string; category: GuideCategory; title_sk: string; title_cs: string; context_sk: string; context_cs: string }[];
}

export interface Suggestion {
  commander: CommanderRef;
  pairs: Pair[];
}

/** Every pair of the guides, once: from the primary commander's side (the secondary side mirrors it), one pair per
 * alternative partner ("Attila / Gang Gamchan" = two pairs). A commander alone (role solo) is no pair. */
export function pairsOf(all: IndexedCommander[]): Pair[] {
  const pairs = new Map<string, Pair>();
  for (const commander of all) {
    const primary: CommanderRef = { name: commander.name, icon: commander.icon };
    for (const entry of commander.entries.filter((e) => e.role === 'primary')) {
      const partners: (CommanderRef | null)[] = entry.partners.length ? entry.partners : [null];
      for (const secondary of partners) {
        const key = `${commanderKey(primary.name)}+${secondary ? commanderKey(secondary.name) : ''}`;
        const pair = pairs.get(key) ?? { key, primary, secondary, guides: [] };
        if (!pair.guides.some((g) => g.slug === entry.slug && g.context_sk === entry.context_sk)) {
          pair.guides.push({
            slug: entry.slug,
            category: entry.category,
            title_sk: entry.title_sk,
            title_cs: entry.title_cs,
            context_sk: entry.context_sk,
            context_cs: entry.context_cs,
          });
        }
        pairs.set(key, pair);
      }
    }
  }
  return [...pairs.values()];
}

/** The pairs the player can field now, and the commanders that would add the most pairs (one missing each). */
export function plan(pairs: Pair[], owned: ReadonlySet<string>): { ready: Pair[]; missing: Suggestion[] } {
  const has = (c: CommanderRef | null) => !c || owned.has(commanderKey(c.name));
  const ready = pairs.filter((p) => has(p.primary) && has(p.secondary));
  const missing = new Map<string, Suggestion>();
  for (const pair of pairs) {
    if (!pair.secondary) continue; // "anyone" needs only the primary
    const lacking = [pair.primary, pair.secondary].filter((c) => !has(c));
    if (lacking.length !== 1) continue;
    const key = commanderKey(lacking[0].name);
    const suggestion = missing.get(key) ?? { commander: lacking[0], pairs: [] };
    suggestion.pairs.push(pair);
    missing.set(key, suggestion);
  }
  return {
    ready,
    missing: [...missing.values()]
      .sort((a, b) => b.pairs.length - a.pairs.length || a.commander.name.localeCompare(b.commander.name))
      .slice(0, SUGGESTIONS),
  };
}

/**
 * /navody: "Čo môžem postaviť" – the player ticks the commanders they own and sees the pairs of our guides they can
 * field right away, plus the commanders that would open the most new pairs. No advice of our own: only the guides'
 * pairs. The choice stays in this browser (localStorage). Deferred in the hub (bundle budget); hidden when the API fails.
 */
@Component({
  selector: 'app-my-commanders',
  imports: [RouterLink, Icon],
  templateUrl: './my-commanders.html',
  styleUrls: ['./commander-finder.scss', './my-commanders.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyCommanders {
  protected readonly i18n = inject(I18n);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  protected readonly t = computed(() => this.i18n.t().builder);

  protected readonly data = httpResource<IndexedCommander[]>(() => (this.isBrowser ? '/api/commanders/' : undefined));
  /** without the gatherers and the KvK1 / KvK2 commanders (hidden-commanders.ts) */
  protected readonly commanders = computed(() =>
    this.data.hasValue() ? this.data.value().filter((c) => shownCommander(c.name)) : [],
  );
  /** pairs of the shown commanders only – a hidden one could never be ticked */
  private readonly pairs = computed(() =>
    pairsOf(this.commanders()).filter((p) => !p.secondary || shownCommander(p.secondary.name)),
  );

  protected readonly owned = signal<ReadonlySet<string>>(new Set());
  protected readonly filter = signal('');

  protected readonly shown = computed(() => {
    const query = fold(this.filter());
    return query ? this.commanders().filter((c) => fold(c.name).includes(query)) : this.commanders();
  });
  /** only commanders the guides know count – a key kept from an older list does not */
  protected readonly ownedCount = computed(
    () => this.commanders().filter((c) => this.owned().has(commanderKey(c.name))).length,
  );
  protected readonly result = computed(() => plan(this.pairs(), this.owned()));

  constructor() {
    afterNextRender(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(OWNED_KEY) ?? '[]');
        if (Array.isArray(saved)) this.owned.set(new Set(saved.filter((k) => typeof k === 'string')));
      } catch {
        // blocked or broken storage: start empty
      }
    });
  }

  protected isOwned(c: CommanderRef): boolean {
    return this.owned().has(commanderKey(c.name));
  }

  protected toggle(c: CommanderRef): void {
    const next = new Set(this.owned());
    const key = commanderKey(c.name);
    if (!next.delete(key)) next.add(key);
    this.save(next);
  }

  protected clear(): void {
    this.save(new Set());
  }

  protected title(g: Pair['guides'][number]): string {
    return (this.i18n.lang() === 'cs' && g.title_cs) || g.title_sk;
  }

  protected context(g: Pair['guides'][number]): string {
    return this.i18n.lang() === 'cs' ? g.context_cs : g.context_sk;
  }

  /** "1 commander", "3 commanderi"… – forms { one, few, other } with {n} */
  protected count(n: number, forms: { one: string; few: string; other: string }): string {
    const rule = new Intl.PluralRules(this.i18n.lang()).select(n);
    return (rule === 'one' ? forms.one : rule === 'few' ? forms.few : forms.other).replace('{n}', String(n));
  }

  private save(owned: Set<string>): void {
    this.owned.set(owned);
    try {
      if (owned.size) localStorage.setItem(OWNED_KEY, JSON.stringify([...owned].sort()));
      else localStorage.removeItem(OWNED_KEY);
    } catch {
      // the choice still works for this visit
    }
  }
}

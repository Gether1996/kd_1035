import { isPlatformBrowser } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { fold } from '../shared/search';
import { shownCommander } from './hidden-commanders';
import { GuideCategory } from './i18n/i18n';

// The commander index of our guides (GET /api/commanders/, backend/guides/commander_index.py) and the pairs in it –
// shared by "Nájdi pár pre commandera", "Čo môžem postaviť" (/navody) and the march cards, which link to the guide of
// their pair (CommanderIndex below) without pulling either /navody component into their chunks.

export interface CommanderRef {
  name: string;
  /** the portrait, /static/guides/commanders/<slug>.webp */
  icon: string;
}

/** One pair of one guide from the commander's side (backend/guides/commander_index.py). */
export interface CommanderEntry {
  slug: string;
  category: GuideCategory;
  title_sk: string;
  title_cs: string;
  /** solo = a single commander to focus on, no partner */
  role: 'primary' | 'secondary' | 'solo';
  /** alternatives ("Attila / Gang Gamchan"); empty with a role primary = anyone */
  partners: CommanderRef[];
  /** the troops column or the line-up label of the guide; '' = the guide title says it */
  context_sk: string;
  context_cs: string;
}

export interface IndexedCommander extends CommanderRef {
  entries: CommanderEntry[];
}

/** "Sun Tzu Prime" → sun-tzu-prime, the ?commander= value (the backend's slug of the name) */
export function commanderKey(name: string): string {
  return fold(name)
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** A pair of a guide: the primary commander and the secondary (null = anyone). */
export interface Pair {
  key: string;
  primary: CommanderRef;
  secondary: CommanderRef | null;
  guides: { slug: string; category: GuideCategory; title_sk: string; title_cs: string; context_sk: string; context_cs: string }[];
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

/** Where a march card links: the guide of its pair, or the pairs of its primary commander in the finder on /navody. */
export type PairGuideLink =
  | { kind: 'pair'; slug: string; category: GuideCategory; title_sk: string; title_cs: string }
  | { kind: 'commander'; name: string; key: string };

/**
 * The link of a march (Gether 3. 11. 2026): its pair in a guide (the first guide of it; the guides' "anyone" partner
 * counts when the exact pair is not there), else the finder for its primary commander, else nothing. Only the meta
 * commanders of the finder (core/hidden-commanders.ts) – a hidden one, as primary or as partner, gets no pair link.
 */
export function pairGuideLink(all: IndexedCommander[], primary: string, secondary: string): PairGuideLink | null {
  if (!primary || !shownCommander(primary)) return null;
  const key = commanderKey(primary);
  const commander = all.find((c) => commanderKey(c.name) === key);
  if (!commander) return null;
  const pairs = new Map(pairsOf([commander]).map((p) => [p.key, p]));
  const pair = (secondary && shownCommander(secondary) && pairs.get(`${key}+${commanderKey(secondary)}`)) || pairs.get(`${key}+`);
  const guide = pair && pair.guides[0];
  if (guide) return { kind: 'pair', slug: guide.slug, category: guide.category, title_sk: guide.title_sk, title_cs: guide.title_cs };
  return { kind: 'commander', name: commander.name, key };
}

/**
 * The commander index for the march cards: asked for once (the first card calls load()), only in the browser, and
 * shared by every card of every page. A failed request leaves it null – the cards show no link.
 */
@Injectable({ providedIn: 'root' })
export class CommanderIndex {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly wanted = signal(false);
  private readonly data = httpResource<IndexedCommander[]>(() =>
    this.isBrowser && this.wanted() ? '/api/commanders/' : undefined,
  );
  readonly commanders = computed(() => (this.data.hasValue() ? this.data.value() : null));

  load(): void {
    this.wanted.set(true);
  }
}

import { isPlatformBrowser } from '@angular/common';
import { httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  PLATFORM_ID,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { GuideCategory, I18n } from '../../core/i18n/i18n';
import { Icon } from '../../shared/icon';
import { fold } from '../../shared/search';

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

type Role = CommanderEntry['role'];

/** The same pair in several guides is one card with a link to each. */
interface Card {
  key: string;
  partners: CommanderRef[];
  guides: { slug: string; category: GuideCategory; title: string; context: string }[];
}

const ROLES: Role[] = ['primary', 'secondary', 'solo'];

/** "Sun Tzu Prime" → sun-tzu-prime, the ?commander= value (the backend's slug of the name) */
export function commanderKey(name: string): string {
  return fold(name)
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * /navody: "Nájdi pár pre commandera" – a combobox of every commander of the commander guides and, for the chosen
 * one, the pairs those guides recommend (as primary, as secondary, alone). Deferred in the hub (bundle budget); the
 * choice is kept in ?commander=. Hidden when the API fails.
 */
@Component({
  selector: 'app-commander-finder',
  imports: [RouterLink, Icon],
  templateUrl: './commander-finder.html',
  styleUrl: './commander-finder.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommanderFinder {
  /** ?commander= of the hub */
  readonly commander = input<string>();

  protected readonly i18n = inject(I18n);
  private readonly router = inject(Router);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  protected readonly t = computed(() => this.i18n.t().finder);
  protected readonly roles = ROLES;

  protected readonly data = httpResource<IndexedCommander[]>(() => (this.isBrowser ? '/api/commanders/' : undefined));
  private readonly all = computed(() => (this.data.hasValue() ? this.data.value() : []));

  protected readonly selected = computed(() => {
    const key = this.commander();
    return (key && this.all().find((c) => commanderKey(c.name) === key)) || null;
  });
  /** the text in the field; a choice (also one from the address) writes its name there */
  protected readonly query = linkedSignal(() => this.selected()?.name ?? '');
  protected readonly open = signal(false);
  /** index of the highlighted option (aria-activedescendant) */
  protected readonly active = linkedSignal<IndexedCommander[], number>({ source: () => this.options(), computation: () => 0 });

  /** names containing the text, those starting with it first; everything while the field is empty */
  protected readonly options = computed(() => {
    const query = fold(this.query());
    const all = this.all();
    if (!query || query === fold(this.selected()?.name ?? '')) return all;
    const found = all.filter((c) => fold(c.name).includes(query));
    return [...found.filter((c) => fold(c.name).startsWith(query)), ...found.filter((c) => !fold(c.name).startsWith(query))];
  });
  protected readonly activeId = computed(() =>
    this.open() && this.options().length ? `finder-option-${this.active()}` : null,
  );

  /** the chosen commander's pairs, by role; a pair named in several guides once with a link to each */
  protected readonly groups = computed(() => {
    const commander = this.selected();
    if (!commander) return [];
    const cs = this.i18n.lang() === 'cs';
    return ROLES.map((role) => {
      const cards = new Map<string, Card>();
      for (const entry of commander.entries.filter((e) => e.role === role)) {
        const key = entry.partners.map((p) => p.icon).join('|');
        const card = cards.get(key) ?? { key, partners: entry.partners, guides: [] };
        card.guides.push({
          slug: entry.slug,
          category: entry.category,
          title: (cs && entry.title_cs) || entry.title_sk,
          context: cs ? entry.context_cs : entry.context_sk,
        });
        cards.set(key, card);
      }
      return { role, cards: [...cards.values()] };
    }).filter((group) => group.cards.length);
  });
  protected readonly count = computed(() => {
    const n = this.groups().reduce((sum, group) => sum + group.cards.length, 0);
    const forms = this.t().count;
    const rule = new Intl.PluralRules(this.i18n.lang()).select(n);
    return `${n} ${rule === 'one' ? forms.one : rule === 'few' ? forms.few : forms.other}`;
  });

  private readonly input = viewChild<ElementRef<HTMLInputElement>>('field');
  private readonly list = viewChild<ElementRef<HTMLUListElement>>('list');

  protected type(value: string): void {
    this.query.set(value);
    this.open.set(true);
  }

  protected key(event: KeyboardEvent): void {
    const count = this.options().length;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        if (!this.open()) {
          this.open.set(true);
          return;
        }
        if (!count) return;
        const step = event.key === 'ArrowDown' ? 1 : -1;
        this.highlight((this.active() + step + count) % count);
        return;
      }
      case 'Enter':
        if (this.open() && count) {
          event.preventDefault();
          this.choose(this.options()[this.active()]);
        }
        return;
      case 'Escape':
        // closes the list first, a second Escape empties the field
        if (this.open()) this.open.set(false);
        else if (this.query()) this.clear();
        return;
    }
  }

  protected highlight(index: number): void {
    this.active.set(index);
    this.list()?.nativeElement.children[index]?.scrollIntoView({ block: 'nearest' });
  }

  protected choose(commander: IndexedCommander): void {
    this.query.set(commander.name);
    this.open.set(false);
    this.remember(commanderKey(commander.name));
  }

  protected clear(): void {
    this.query.set('');
    this.remember(null);
    this.input()?.nativeElement.focus();
  }

  /** the choice in the address, so a link with ?commander= opens the same answer */
  private remember(key: string | null): void {
    void this.router.navigate([], { queryParams: { commander: key }, queryParamsHandling: 'merge', replaceUrl: true });
  }
}

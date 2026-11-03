import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { I18n, Page } from '../../core/i18n/i18n';
import { Icon } from '../icon';
import { fold } from '../search';
import { SEARCH_TEXTS } from './texts';

/** a found thing: what it is called, a short line under it, where it leads (an in-site path with its query) */
export interface Hit {
  title: string;
  detail: string;
  link: string;
}

type Group = 'pages' | 'guides' | 'glossary' | 'commanders' | 'events';

const GROUPS: Group[] = ['pages', 'guides', 'glossary', 'commanders', 'events'];
/** results shown per group */
const PER_GROUP = 6;
/** public pages worth finding by name; account pages need a sign-in, the hall an approval – left out */
const PAGES: Parameters<I18n['path']>[0][] = ['home', 'about', 'calendar', 'guideHub', 'glossary', 'changelog', 'reminders', 'kvk', 'terms', 'privacy'];

interface Source {
  title: string;
  /** also searched, not shown (the full name of a term, the other language) */
  extra?: string;
  detail: string;
  link: string;
}

/**
 * Search the whole website from the header (Gether 3. 11. 2026, idea 9): pages, guides, glossary terms, commanders
 * of our pairs and events, without diacritics. Loaded on its first opening only (a @defer in the header), its data
 * then too; a source whose request fails is left out, the rest still answers. Public data only – no player names.
 */
@Component({
  selector: 'app-site-search',
  imports: [Icon],
  templateUrl: './site-search.html',
  styleUrl: './site-search.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteSearch {
  readonly closed = output<void>();

  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  protected readonly i18n = inject(I18n);
  protected readonly t = computed(() => SEARCH_TEXTS[this.i18n.lang()]);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly results = viewChild<ElementRef<HTMLElement>>('results');

  protected readonly query = signal('');
  private readonly sources = signal<Record<Group, Source[]>>({ pages: [], guides: [], glossary: [], commanders: [], events: [] });
  protected readonly loading = signal(true);

  protected readonly groups = computed(() => {
    const query = fold(this.query().trim());
    if (query.length < 2) return [];
    const sources = this.sources();
    return GROUPS.map((group) => ({
      group,
      hits: sources[group]
        .filter((s) => fold(`${s.title} ${s.extra ?? ''} ${s.detail}`).includes(query))
        .slice(0, PER_GROUP),
    })).filter((g) => g.hits.length);
  });

  constructor() {
    afterNextRender(() => {
      this.dialog().nativeElement.showModal();
      void this.load();
    });
  }

  private async load(): Promise<void> {
    const cs = this.i18n.lang() === 'cs';
    const t = this.i18n.t();
    const pages: Source[] = PAGES.map((page) => ({
      title: this.pageTitle(page),
      detail: '',
      link: this.i18n.path(page),
    }));
    this.sources.update((s) => ({ ...s, pages }));
    const tasks: Promise<void>[] = [
      firstValueFrom(this.http.get<GuideRow[]>('/api/guides/')).then((rows) =>
        this.set(
          'guides',
          rows.map((g) => ({
            title: cs ? g.title_cs || g.title_sk : g.title_sk,
            extra: cs ? g.title_sk : g.title_cs,
            detail: (cs ? g.excerpt_cs || g.excerpt_sk : g.excerpt_sk) ?? '',
            link: this.i18n.guidePath(g.category, g.slug),
          })),
        ),
      ),
      import('../../pages/glossary/terms').then(({ TERMS }) =>
        this.set(
          'glossary',
          TERMS.map((term) => ({
            title: (cs && term.termCs) || term.term,
            extra: term.full ?? '',
            detail: cs ? term.cs : term.sk,
            link: `${this.i18n.path('glossary')}#${term.id}`,
          })),
        ),
      ),
      Promise.all([
        firstValueFrom(this.http.get<CommanderRow[]>('/api/commanders/')),
        import('../../core/hidden-commanders'),
        import('../../core/commander-index'),
      ]).then(([rows, { shownCommander }, { commanderKey }]) =>
        this.set(
          'commanders',
          rows
            .filter((c) => shownCommander(c.name))
            .map((c) => ({
              title: c.name,
              detail: this.t().commanderDetail,
              link: `${this.i18n.path('guideHub')}?commander=${encodeURIComponent(commanderKey(c.name))}`,
            })),
        ),
      ),
      Promise.all([
        firstValueFrom(this.http.get<EventsRow>('/api/events/')),
        import('../../pages/calendar/deep-link'),
      ]).then(([data, { eventLink }]) => {
        const now = new Date();
        const seen = new Set<number>();
        const events = [...(data.occurrences ?? []), ...(data.irregular ?? [])].filter((e) => !seen.has(e.id) && seen.add(e.id));
        this.set(
          'events',
          events.map((e) => ({
            title: (cs && e.name_cs) || e.name_sk,
            detail: e.start ? new Intl.DateTimeFormat(this.i18n.locale(), { day: 'numeric', month: 'numeric' }).format(new Date(e.start)) : '',
            link: `${this.i18n.path('calendar')}${eventLink(e, now)}`,
          })),
        );
      }),
    ];
    // a source that fails is left out; the others still answer
    await Promise.allSettled(tasks);
    this.loading.set(false);
  }

  private set(group: Group, list: Source[]): void {
    this.sources.update((s) => ({ ...s, [group]: list }));
  }

  private pageTitle(page: Parameters<I18n['path']>[0]): string {
    const t = this.i18n.t();
    const nav = t.nav as Record<string, string>;
    const names: Partial<Record<Page, string>> = {
      home: nav['home'],
      about: nav['about'],
      calendar: nav['calendar'],
      guideHub: nav['guides'],
      glossary: t.glossary.title,
      changelog: t.changelog.title,
      reminders: nav['reminders'],
      kvk: nav['kvk'],
      terms: nav['terms'],
      privacy: nav['privacy'],
    };
    return names[page] ?? page;
  }

  /** arrows move through the results and back to the field; Enter follows the focused link */
  protected key(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const links = Array.from(this.results()?.nativeElement.querySelectorAll<HTMLAnchorElement>('a') ?? []);
    if (!links.length) return;
    event.preventDefault();
    const at = links.indexOf(document.activeElement as HTMLAnchorElement);
    const next = event.key === 'ArrowDown' ? at + 1 : at - 1;
    if (next < 0) this.dialog().nativeElement.querySelector<HTMLInputElement>('input')?.focus();
    else links[Math.min(next, links.length - 1)].focus();
  }

  protected go(event: MouseEvent, link: string): void {
    // in-site links through the router, so the page does not reload; a new tab keeps the browser's way
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    this.dialog().nativeElement.close();
    void this.router.navigateByUrl(link);
  }

  protected close(): void {
    this.dialog().nativeElement.close();
  }
}

interface GuideRow {
  slug: string;
  category: Parameters<I18n['guidePath']>[0];
  title_sk: string;
  title_cs: string;
  excerpt_sk?: string;
  excerpt_cs?: string;
}

interface CommanderRow {
  name: string;
}

interface EventRow {
  id: number;
  name_sk: string;
  name_cs: string;
  start?: string | null;
  end?: string | null;
}

interface EventsRow {
  occurrences?: EventRow[];
  irregular?: EventRow[];
}

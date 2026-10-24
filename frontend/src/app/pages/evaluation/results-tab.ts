import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  model,
  output,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ArmoryIndex } from '../../core/armory';
import { I18n } from '../../core/i18n/i18n';
import { KINGDOM_ZONE } from '../../core/kingdom-zone';
import { marchIcon } from '../../core/kvk-api';
import { Icon } from '../../shared/icon';
import { fold } from '../../shared/search';
import { overCapText } from '../../shared/stat-label';
import { RecordChange } from './evaluation-api';
import {
  Evaluation,
  MarchEval,
  POWER_FILTERS,
  PlayerEval,
  QUICK_FILTERS,
  QuickFilter,
  overLimit,
  parsePowerList,
  quickMatch,
} from './scoring';
import { EvalSettings } from './settings';
import { EvalTexts } from './texts';
import { EvalHistory } from './history';
import { EvalTip } from './tip';

type Show = 'marches' | 'approved' | 'all';
type Sort = 'required' | 'name' | 'power';

/** ?f= of the address: a quick filter, anything else = all */
const asQuick = (query: string | undefined): QuickFilter =>
  QUICK_FILTERS.includes(query as QuickFilter) ? (query as QuickFilter) : 'all';

/**
 * "Odhad acclaimu" of /vyhodnocovanie: one row per player – the counted marches, the acclaim they should
 * reach, what the superadmin wrote down (power, T4); a row opens the computation march by march. CSV for a
 * spreadsheet or Discord; "Zverejniť" publishes the required acclaim for the players with the overview switch.
 * The acclaim reached is not a column any more, nor the progress and the fund counted from it (Gether 14. 10. 2026:
 * "aktuálny acclaim dajme preč").
 */
@Component({
  selector: 'app-eval-results',
  imports: [RouterLink, Icon, EvalTip, EvalHistory],
  templateUrl: './results-tab.html',
  styleUrl: './results-tab.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EvalResultsTab {
  readonly evaluation = input.required<Evaluation>();
  readonly settings = input.required<EvalSettings>();
  readonly texts = input.required<EvalTexts>();
  /** the formation names of the detail */
  readonly armory = input<ArmoryIndex | null>(null);
  /** the variables are not saved yet */
  readonly dirty = input(false);
  /** "Aj neschválení" – the server sends un-approved players to the superuser only */
  readonly superuser = input(false);
  /** the last note about a player was not saved */
  readonly failed = input(false);
  /** "Rátať s power" – off: the estimate from the marches only */
  readonly usePower = model(true);
  readonly record = output<{ id: number; change: RecordChange }>();
  /** the power of many players pasted at once */
  readonly records = output<(RecordChange & { id: number })[]>();
  /** when the required acclaim was published (null = never), how many players would see another value now */
  readonly publishedAt = input<string | null>(null);
  readonly changes = input(0);
  readonly publishing = input(false);
  readonly publishFailed = input(false);
  readonly publish = output<void>();
  /** ?f=fix|nopower|over of the page – a link from Discord opens the same view */
  readonly filter = input<string>();
  /** ?hrac= of the page – this player's row opens once (and shows even when the filters would hide it) */
  readonly focus = input<number | null>(null);

  protected readonly i18n = inject(I18n);
  private readonly router = inject(Router);
  protected readonly icon = marchIcon;
  protected readonly search = signal('');
  protected readonly show = signal<Show>('marches');
  protected readonly sort = signal<Sort>('required');
  protected readonly opened = signal<ReadonlySet<number>>(new Set());
  protected readonly shows = computed<Show[]>(() =>
    this.superuser() ? ['marches', 'approved', 'all'] : ['marches', 'approved'],
  );
  protected readonly sorts: Sort[] = ['required', 'name', 'power'];

  /**
   * The quick filters (to-do lists before KvK): "Na opravu", "Bez power", "Nad odp. power"; the power ones only while
   * the table counts with power
   */
  protected readonly quicks = computed(() => QUICK_FILTERS.filter((f) => this.usePower() || !POWER_FILTERS.has(f)));
  /** from ?f=; a click keeps its pick until the address changes, "Rátať s power" off drops a power one */
  protected readonly quick = linkedSignal<{ query: string | undefined; power: boolean }, QuickFilter>({
    source: () => ({ query: this.filter(), power: this.usePower() }),
    computation: ({ query, power }, previous) => {
      const picked = previous && previous.source.query === query ? previous.value : asQuick(query);
      return !power && POWER_FILTERS.has(picked) ? 'all' : picked;
    },
  });

  /** the players the search and "Hráči" leave – the counts on the quick filters are from them */
  private readonly listed = computed(() => {
    const query = fold(this.search());
    const show = this.show();
    return this.evaluation().rows.filter((r) => {
      if (show !== 'all' && !r.player.approved) return false;
      if (show === 'marches' && !r.counted) return false;
      return !query || fold(`${r.player.ingame_name} ${r.player.name}`).includes(query);
    });
  });

  protected readonly counts = computed(() => {
    const rows = this.listed();
    return Object.fromEntries(QUICK_FILTERS.map((f) => [f, rows.filter((r) => quickMatch(f, r)).length])) as Record<
      QuickFilter,
      number
    >;
  });

  protected readonly rows = computed(() => {
    const quick = this.quick();
    const rows = this.listed().filter((r) => quickMatch(quick, r));
    const name = (r: PlayerEval) => r.player.ingame_name || r.player.name;
    const sort = this.sort();
    return rows.sort((a, b) => {
      if (sort === 'name') return name(a).localeCompare(name(b));
      // the most power first, the players without it last
      if (sort === 'power') return (b.player.power ?? -1) - (a.player.power ?? -1) || name(a).localeCompare(name(b));
      return b.acclaim.required - a.acclaim.required;
    });
  });

  constructor() {
    // ?f=nopower|over while the table does not count with power (a link, or the switch turned off): out of the address
    effect(() => {
      if (!this.usePower() && POWER_FILTERS.has(this.filter() ?? '')) untracked(() => this.setFilterQuery(null));
    });
    // the player of ?hrac=: shown and opened once – a row closed by hand afterwards stays closed
    let openedFor: number | null = null;
    effect(() => {
      const id = this.focus();
      const row = this.evaluation().rows.find((r) => r.player.id === id);
      if (!row || id === openedFor) return;
      openedFor = id;
      untracked(() => {
        if (!row.player.approved) this.show.set('all');
        else if (!row.counted && this.show() === 'marches') this.show.set('approved');
        if (!quickMatch(this.quick(), row)) this.setQuick('all');
        this.opened.update((opened) => new Set(opened).add(row.player.id));
      });
    });
  }

  /** a quick filter, kept in ?f= next to ?tab= (no new history entry, like ?cmd= on /marche) */
  protected setQuick(filter: QuickFilter): void {
    this.quick.set(filter);
    this.setFilterQuery(filter === 'all' ? null : filter);
  }

  private setFilterQuery(f: string | null): void {
    void this.router.navigate([], { queryParams: { f }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  // ---------------------------------------------------------------- the power of everyone at once

  protected readonly bulkOpen = signal(false);
  protected readonly bulkResult = signal('');

  protected saveBulk(box: HTMLTextAreaElement): void {
    const b = this.texts().bulk;
    const { found, unknown } = parsePowerList(box.value, this.evaluation().rows.map((r) => r.player));
    const parts: string[] = [];
    if (found.length) {
      this.records.emit(found);
      parts.push(b.done.replace('{n}', String(found.length)));
      // the lines not understood stay for a second try
      box.value = unknown.join('\n');
    } else {
      parts.push(b.none);
    }
    if (unknown.length) parts.push(b.unknown.replace('{names}', unknown.join(', ')));
    this.bulkResult.set(parts.join(' '));
  }

  /** nobody has power written down: the estimate is from the marches only */
  protected readonly noPower = computed(() => this.evaluation().rows.every((r) => r.player.power === null));

  // ---------------------------------------------------------------- formatting

  protected int(n: number): string {
    return new Intl.NumberFormat(this.i18n.locale(), { maximumFractionDigits: 0 }).format(n);
  }

  protected dec(n: number, digits = 1): string {
    return new Intl.NumberFormat(this.i18n.locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
  }

  protected name(r: PlayerEval): string {
    return r.player.ingame_name || r.player.name;
  }

  /** the state next to "Zverejniť": when, and whether the players see what the table counts now */
  protected readonly publishState = computed(() => {
    const p = this.texts().publish;
    const at = this.publishedAt();
    if (!at) return p.never;
    const date = new Intl.DateTimeFormat(this.i18n.locale(), {
      day: 'numeric',
      month: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: KINGDOM_ZONE,
    }).format(new Date(at));
    const n = this.changes();
    return `${p.at.replace('{date}', date)} ${n ? p.changed.replace('{n}', String(n)) : p.same}`;
  });

  protected missingText(r: PlayerEval): string {
    return this.texts()
      .detail.missing.replace('{n}', String(r.missing))
      .replace('{power}', this.dec(r.player.power ?? 0))
      .replace('{expected}', String(r.expected ?? 0));
  }

  /**
   * "Odp. power" is the power the player's own counted marches carry (Gether 14. 10. 2026: 3 marches cannot recommend
   * 104 M) – the recommended power of the marches counted with the missing ones is in the computation of the detail
   */
  protected over(r: PlayerEval): boolean {
    return this.usePower() && overLimit(r);
  }

  protected limitText(r: PlayerEval): string | null {
    const d = this.texts().detail;
    if (r.ownLimit === null) return null;
    const power = r.player.power;
    if (power !== null && this.usePower() && power > r.ownLimit) return d.powerOver.replace('{m}', this.dec(power - r.ownLimit));
    return d.powerLimit.replace('{m}', String(r.ownLimit));
  }

  protected t4Text(): string {
    return this.texts().detail.t4.replace('{p}', String(this.settings().acclaim.t4));
  }

  protected gearText(m: MarchEval): string {
    const d = this.texts().detail;
    const e = m.equipment;
    if (!e.pieces) return d.noGear;
    return [
      d.legendary.replace('{n}', String(e.legendary)),
      d.crit.replace('{n}', String(e.crit)),
      d.iconic.replace('{n}', this.dec(e.iconic)),
    ].join(' · ');
  }

  protected armamentText(m: MarchEval): string {
    const d = this.texts().detail;
    if (!m.armaments.filled) return d.noArmaments;
    const text = d.stats.replace('{a}', this.dec(m.armaments.stats)).replace('{b}', this.dec(m.armaments.inscriptions));
    const parts = [m.armaments.tiered ? `${text} (${d.tiered})` : text];
    // a formation the primary commander should not lead with (Gether 14. 10. 2026)
    if (m.formation.ok === false) {
      const name = (id: string | undefined) => (id && this.armory()?.formations.get(id)?.name) || id || '';
      parts.push(
        d.wrongFormation
          .replace('{have}', name(m.march.formation))
          .replace('{want}', m.formation.preferred.map(name).join(' / '))
          .replace('{f}', this.dec(this.settings().formations.wrong, 2)),
      );
    }
    return parts.join(' · ');
  }

  /** an armament bonus over its cap – a typo, counted as the cap (Gether 19. 10. 2026); '' = none */
  protected overCap(m: MarchEval): string {
    const text = overCapText(this.i18n.t().marches, m.march);
    return text ? this.texts().detail.overCap.replace('{stats}', text) : '';
  }

  /** a factor of the acclaim against the benchmark: "power 91 / 102 M = 0,89" (Gether 24. 10. 2026) */
  protected partText(r: PlayerEval, part: 'power' | 'marches' | 'quality'): string {
    const d = this.texts().detail;
    const b = this.evaluation().benchmark;
    const f = (n: number) => new Intl.NumberFormat(this.i18n.locale(), { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(n);
    if (part === 'power') {
      return d.partPower
        .replace('{p}', this.dec(Math.max(r.power ?? 0, b.powerBase)))
        .replace('{b}', this.dec(Math.max(b.power, b.powerBase)))
        .replace('{f}', f(r.acclaim.power));
    }
    if (part === 'marches') {
      const n = Math.min(b.marches, r.counted + r.missing);
      return d.partMarches.replace('{n}', String(n)).replace('{b}', String(b.marches)).replace('{f}', f(r.acclaim.marches));
    }
    return d.partQuality.replace('{q}', this.dec(r.quality)).replace('{b}', this.dec(b.quality)).replace('{f}', f(r.acclaim.quality));
  }

  // ---------------------------------------------------------------- explanations

  protected tip(key: string): string {
    return this.texts().tips[key] ?? '';
  }

  protected tipLabel(label: string): string {
    return this.texts().tipLabel.replace('{label}', label);
  }

  // ---------------------------------------------------------------- the notes

  protected toggle(id: number): void {
    const next = new Set(this.opened());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.opened.set(next);
  }

  /** a whole number or one decimal (power); empty = not written down */
  private parse(box: HTMLInputElement, decimals: number): number | null | undefined {
    const text = box.value.replace(/\s/g, '').replace(',', '.');
    if (!text) return null;
    const value = Number(text);
    if (!Number.isFinite(value) || value < 0) return undefined;
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  }

  protected setPower(r: PlayerEval, event: Event): void {
    const box = event.target as HTMLInputElement;
    const value = this.parse(box, 1);
    if (value === undefined) box.value = r.player.power === null ? '' : String(r.player.power);
    else if (value !== r.player.power) this.record.emit({ id: r.player.id, change: { power: value } });
  }

  protected setBonus(r: PlayerEval, event: Event): void {
    const box = event.target as HTMLInputElement;
    const text = box.value.replace(',', '.').trim();
    const value = text ? Math.round(Number(text) * 10) / 10 : 0;
    if (!Number.isFinite(value) || Math.abs(value) > 999.9) box.value = String(r.player.power_bonus);
    else if (value !== r.player.power_bonus) this.record.emit({ id: r.player.id, change: { power_bonus: value } });
  }

  protected setT4(r: PlayerEval, event: Event): void {
    this.record.emit({ id: r.player.id, change: { t4: (event.target as HTMLInputElement).checked } });
  }

  // ---------------------------------------------------------------- CSV

  /** the rows shown as CSV (semicolons and a BOM: a Slovak or Czech Excel opens it right away) */
  protected download(): void {
    const c = this.texts().columns;
    // the columns of the table: no score (Slim 13. 10. 2026: "skóre by som dal z tabuľky preč")
    const head = [c.player, 'Discord', c.marches, c.required, c.power, c.recommended, c.t4];
    const cell = (v: string | number | null) => {
      const text = v === null ? '' : typeof v === 'number' ? String(Math.round(v * 100) / 100).replace('.', ',') : v;
      return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const lines = this.rows().map((r) =>
      [
        this.name(r),
        r.player.name,
        r.counted + (r.missing ? ` + ${r.missing}` : ''),
        r.acclaim.required,
        r.player.power,
        r.ownLimit,
        r.player.t4 ? 'T4' : '',
      ]
        .map(cell)
        .join(';'),
    );
    const blob = new Blob(['﻿' + [head.map(cell).join(';'), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `kd1035-acclaim-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }
}

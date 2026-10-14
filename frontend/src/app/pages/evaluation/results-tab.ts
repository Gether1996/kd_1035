import { ChangeDetectionStrategy, Component, computed, inject, input, model, output, signal } from '@angular/core';
import { I18n } from '../../core/i18n/i18n';
import { marchIcon } from '../../core/kvk-api';
import { Icon } from '../../shared/icon';
import { fold } from '../../shared/search';
import { RecordChange } from './evaluation-api';
import { Evaluation, MarchEval, PlayerEval, parsePowerList } from './scoring';
import { EvalSettings } from './settings';
import { EvalTexts } from './texts';
import { EvalTip } from './tip';

type Show = 'marches' | 'approved' | 'all';
type Sort = 'required' | 'progress' | 'name';

/**
 * "Odhad acclaimu" of /vyhodnocovanie: one row per player – the counted marches, the acclaim they should
 * reach, what the superadmin wrote down (acclaim reached, power, T4) and the progress; a row opens the computation
 * march by march. CSV for a spreadsheet or Discord.
 */
@Component({
  selector: 'app-eval-results',
  imports: [Icon, EvalTip],
  templateUrl: './results-tab.html',
  styleUrl: './results-tab.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EvalResultsTab {
  readonly evaluation = input.required<Evaluation>();
  readonly settings = input.required<EvalSettings>();
  readonly texts = input.required<EvalTexts>();
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

  private readonly i18n = inject(I18n);
  protected readonly icon = marchIcon;
  protected readonly search = signal('');
  protected readonly show = signal<Show>('marches');
  protected readonly sort = signal<Sort>('required');
  protected readonly opened = signal<ReadonlySet<number>>(new Set());
  protected readonly shows = computed<Show[]>(() =>
    this.superuser() ? ['marches', 'approved', 'all'] : ['marches', 'approved'],
  );
  protected readonly sorts: Sort[] = ['required', 'progress', 'name'];

  protected readonly rows = computed(() => {
    const query = fold(this.search());
    const show = this.show();
    const rows = this.evaluation().rows.filter((r) => {
      if (show !== 'all' && !r.player.approved) return false;
      if (show === 'marches' && !r.counted) return false;
      return !query || fold(`${r.player.ingame_name} ${r.player.name}`).includes(query);
    });
    const name = (r: PlayerEval) => r.player.ingame_name || r.player.name;
    const sort = this.sort();
    return rows.sort((a, b) => {
      if (sort === 'progress') return (a.progress ?? Infinity) - (b.progress ?? Infinity);
      if (sort === 'name') return name(a).localeCompare(name(b));
      return b.acclaim.required - a.acclaim.required;
    });
  });

  protected readonly total = computed(() => this.rows().reduce((sum, r) => sum + r.acclaim.required, 0));
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

  protected compact(n: number): string {
    return new Intl.NumberFormat(this.i18n.locale(), { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  }

  protected percent(n: number): string {
    return new Intl.NumberFormat(this.i18n.locale(), { style: 'percent', maximumFractionDigits: 0 }).format(n);
  }

  protected name(r: PlayerEval): string {
    return r.player.ingame_name || r.player.name;
  }

  /** the progress and the fund are not columns any more (Gether 14. 10. 2026: "progres a FBP daj preč") – the detail */
  protected progressText(r: PlayerEval): string | null {
    if (r.progress === null) return null;
    const d = this.texts().detail;
    const progress = d.progress.replace('{p}', this.percent(r.progress));
    if (!r.fund) return progress;
    const f = this.settings().fund;
    const all = f.food + f.wood + f.stone + f.gold || 1;
    const part = (share: number) => this.compact(((r.fund ?? 0) * share) / all);
    const fund = d.fund
      .replace('{total}', this.compact(r.fund))
      .replace('{food}', part(f.food))
      .replace('{wood}', part(f.wood))
      .replace('{stone}', part(f.stone))
      .replace('{gold}', part(f.gold));
    return `${progress} · ${fund}`;
  }

  protected missingText(r: PlayerEval): string {
    return this.texts()
      .detail.missing.replace('{n}', String(r.missing))
      .replace('{score}', this.dec(r.missingScore))
      .replace('{power}', this.dec(r.player.power ?? 0))
      .replace('{expected}', String(r.expected ?? 0));
  }

  protected excessText(r: PlayerEval): string {
    return this.texts()
      .detail.fromExcess.replace('{m}', this.dec(r.excess))
      .replace('{rec}', String(r.recommended ?? 0))
      .replace('{n}', String(r.counted + r.missing))
      .replace('{per}', this.int(this.settings().power.excess));
  }

  /**
   * "Odp. power" is the power the player's own counted marches carry (Gether 14. 10. 2026: 3 marches cannot recommend
   * 104 M) – the recommended power of the marches counted with the missing ones is in the computation of the detail
   */
  protected over(r: PlayerEval): boolean {
    const power = r.player.power;
    return this.usePower() && power !== null && r.ownLimit !== null && power > r.ownLimit;
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
    return m.armaments.tiered ? `${text} (${d.tiered})` : text;
  }

  /** the score is not a column any more – the acclaim from the marches says how it was counted */
  protected scoreText(r: PlayerEval): string {
    return this.texts().detail.fromScore.replace('{s}', this.dec(r.score)).replace('{per}', this.int(this.evaluation().perPoint));
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

  /** a whole number (acclaim) or one decimal (power); empty = not written down */
  private parse(box: HTMLInputElement, decimals: number): number | null | undefined {
    const text = box.value.replace(/\s/g, '').replace(',', '.');
    if (!text) return null;
    const value = Number(text);
    if (!Number.isFinite(value) || value < 0) return undefined;
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  }

  protected setAcclaim(r: PlayerEval, event: Event): void {
    const box = event.target as HTMLInputElement;
    const value = this.parse(box, 0);
    if (value === undefined) box.value = r.player.acclaim === null ? '' : String(r.player.acclaim);
    else if (value !== r.player.acclaim) this.record.emit({ id: r.player.id, change: { acclaim: value } });
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
    // the columns of the table: no score (Slim 13. 10. 2026: "skóre by som dal z tabuľky preč"), no progress and fund
    // (Gether 14. 10. 2026)
    const head = [c.player, 'Discord', c.marches, c.required, c.acclaim, c.power, c.recommended, c.t4];
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
        r.player.acclaim,
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

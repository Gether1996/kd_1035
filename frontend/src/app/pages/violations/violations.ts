import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { I18n } from '../../core/i18n/i18n';
import { Icon } from '../../shared/icon';
import { StrikeMarks } from './strike-marks';
import { fold } from '../../shared/search';
import { plural } from '../reminders/format';
import { VIOLATION_TEXTS } from './texts';
import {
  ViolationLevel,
  ViolationPlayer,
  ViolationRules,
  ViolationsApi,
  addDays,
  levelOf,
  nextLevel,
} from './violations-api';

type Filter = 'active' | 'cards' | 'all';

/**
 * The Správa tab of /priestupky (Gether 18. 11. 2026: "pridávanie priestupkov pre hráčov s nejakým časom a stupňovaním
 * a časovým resetom, všetko dynamické a nastaviteľné"; the same day strikes instead of yellow cards): the rules and the
 * description for the players (the superadmin edits them), a form for a new violation with the strike it will get, and
 * the players with their standing and the history of their violations.
 */
@Component({
  selector: 'app-violations',
  imports: [Icon, StrikeMarks],
  templateUrl: './violations.html',
  styleUrl: './violations.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Violations {
  private readonly i18n = inject(I18n);
  protected readonly x = computed(() => VIOLATION_TEXTS[this.i18n.lang()]);
  private readonly api = inject(ViolationsApi);
  protected readonly data = this.api.data(() => true);

  /** the rows as loaded, a card added or deleted here replaces its player's row at once */
  protected readonly players = linkedSignal<ViolationPlayer[]>(() => (this.data.hasValue() ? this.data.value().players : []));
  protected readonly rules = linkedSignal<ViolationRules | null>(() => (this.data.hasValue() ? this.data.value().rules : null));
  protected readonly editRules = computed(() => this.data.hasValue() && this.data.value().edit_rules);

  // ---------------------------------------------------------------- the list
  protected readonly filters: Filter[] = ['active', 'cards', 'all'];
  protected readonly filter = signal<Filter>('active');
  protected readonly search = signal('');
  protected readonly open = signal<number | null>(null);
  protected readonly confirming = signal<number | null>(null);
  protected readonly deleteFailed = signal(false);

  protected readonly shown = computed(() => {
    const query = fold(this.search());
    const filter = this.filter();
    return this.players().filter(
      (p) =>
        (filter === 'all' || (filter === 'cards' ? p.cards.length > 0 : p.level > 0)) &&
        (!query || fold(p.name).includes(query)),
    );
  });
  protected readonly counts = computed(() => {
    const all = this.players();
    return { active: all.filter((p) => p.level > 0).length, cards: all.filter((p) => p.cards.length).length, all: all.length };
  });

  // ---------------------------------------------------------------- a new card
  /** the local day, YYYY-MM-DD – no card in the future */
  protected readonly today = localDay(new Date());
  protected readonly player = signal<number | null>(null);
  protected readonly day = signal(this.today);
  protected readonly reason = signal('');
  protected readonly adding = signal(false);
  protected readonly addState = signal<'added' | 'invalid' | 'failed' | null>(null);
  /** "Bude to 2. strike – Kick z aliancie (14 dní)" */
  protected readonly preview = computed(() => {
    const rules = this.rules();
    const row = this.players().find((p) => p.id === this.player());
    if (!rules || !row || !this.day()) return '';
    const level = levelOf(rules.levels, nextLevel(row.cards, this.day(), rules));
    return level ? this.x().add.preview.replace('{level}', this.describe(level)) : '';
  });

  // ---------------------------------------------------------------- the rules
  protected readonly editing = signal(false);
  protected readonly draft = signal<ViolationRules | null>(null);
  protected readonly rulesState = signal<'saved' | 'invalid' | 'failed' | null>(null);
  protected readonly savingRules = signal(false);

  protected describe(level: ViolationLevel): string {
    const days = level.days ? ` (${this.x().days.replace('{n}', String(level.days))})` : '';
    return `${level.name}${level.penalty ? ' – ' + level.penalty : ''}${days}`;
  }

  protected levelName(n: number): string {
    return levelOf(this.rules()?.levels ?? [], n)?.name ?? '';
  }

  protected strikeCount(): number {
    return this.rules()?.levels.length ?? 0;
  }

  protected strikeLabel(n: number): string {
    const of = this.strikeCount();
    return this.x().strike.replace('{n}', String(Math.min(n, of))).replace('{of}', String(of));
  }

  /** the first clean day → the last day the strike holds */
  protected lastDay(resetOn: string): string {
    return this.date(addDays(resetOn, -1));
  }

  protected date(iso: string): string {
    return new Intl.DateTimeFormat(this.i18n.locale(), { day: 'numeric', month: 'numeric', year: 'numeric' }).format(
      new Date(iso + 'T12:00:00'),
    );
  }

  protected cardCount(n: number): string {
    return plural(n, this.x().list.cards);
  }

  protected summary(rules: ViolationRules): string {
    return rules.reset_days ? this.x().reset.replace('{days}', String(rules.reset_days)) : this.x().resetNow;
  }

  protected keep(rules: ViolationRules): string {
    return this.x().rules.keep.replace('{days}', String(rules.keep_days));
  }

  protected async add(event: Event): Promise<void> {
    event.preventDefault();
    const player = this.player();
    const reason = this.reason().trim();
    this.addState.set(null);
    if (!player || !reason || !this.day() || this.day() > this.today) {
      this.addState.set('invalid');
      return;
    }
    this.adding.set(true);
    try {
      const row = await this.api.add(player, this.day(), reason);
      this.replace(row);
      this.reason.set('');
      this.open.set(row.id);
      this.addState.set('added');
    } catch (error) {
      this.addState.set(error instanceof HttpErrorResponse && error.status === 400 ? 'invalid' : 'failed');
    } finally {
      this.adding.set(false);
    }
  }

  protected async remove(cardId: number): Promise<void> {
    if (this.confirming() !== cardId) {
      this.confirming.set(cardId);
      return;
    }
    this.deleteFailed.set(false);
    try {
      this.replace(await this.api.remove(cardId));
      this.confirming.set(null);
    } catch {
      this.deleteFailed.set(true);
    }
  }

  private replace(row: ViolationPlayer): void {
    this.players.update((rows) => rows.map((p) => (p.id === row.id ? row : p)));
  }

  protected startEdit(): void {
    const rules = this.rules();
    if (!rules) return;
    this.draft.set({ ...rules, levels: rules.levels.map((l) => ({ ...l })) });
    this.rulesState.set(null);
    this.editing.set(true);
  }

  protected setRule(key: 'reset_days' | 'keep_days', value: string): void {
    this.draft.update((d) => (d ? { ...d, [key]: Number(value) } : d));
  }

  protected setDescription(value: string): void {
    this.draft.update((d) => (d ? { ...d, description: value } : d));
  }

  protected setLevel(i: number, key: keyof ViolationLevel, value: string): void {
    this.draft.update((d) =>
      d ? { ...d, levels: d.levels.map((l, j) => (j === i ? { ...l, [key]: key === 'days' ? Number(value) : value } : l)) } : d,
    );
  }

  protected addLevel(): void {
    this.draft.update((d) => (d ? { ...d, levels: [...d.levels, { name: '', penalty: '', days: 0 }] } : d));
  }

  protected removeLevel(i: number): void {
    this.draft.update((d) => (d && d.levels.length > 1 ? { ...d, levels: d.levels.filter((_, j) => j !== i) } : d));
  }

  protected async saveRules(event: Event): Promise<void> {
    event.preventDefault();
    const draft = this.draft();
    if (!draft) return;
    const whole = (n: number, min: number) => Number.isInteger(n) && n >= min && n <= 3650;
    const ok =
      whole(draft.reset_days, 0) &&
      whole(draft.keep_days, 30) &&
      draft.levels.length > 0 &&
      draft.levels.every((l) => l.name.trim() && whole(l.days, 0));
    if (!ok) {
      this.rulesState.set('invalid');
      return;
    }
    this.savingRules.set(true);
    try {
      const saved = await this.api.saveRules({
        ...draft,
        description: draft.description.trim(),
        levels: draft.levels.map((l) => ({ name: l.name.trim(), penalty: l.penalty.trim(), days: l.days })),
      });
      this.rules.set(saved);
      this.editing.set(false);
      this.rulesState.set('saved');
      // the levels and dates of every player follow the new rules
      this.data.reload();
    } catch (error) {
      this.rulesState.set(error instanceof HttpErrorResponse && error.status === 400 ? 'invalid' : 'failed');
    } finally {
      this.savingRules.set(false);
    }
  }
}

function localDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

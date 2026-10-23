import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  model,
  signal,
} from '@angular/core';
import { ArmoryIndex, InscriptionRarity } from '../../core/armory';
import { MARCH_KINDS, MarchKind, March } from '../../core/kvk-api';
import { Icon } from '../../shared/icon';
import { fold } from '../../shared/search';
import { EvalPlayer, Evaluation, formationOf, formationTable, inscriptionValue, missingPairs, skillFactor } from './scoring';
import {
  EvalSettings,
  INSCRIPTION_TIERS,
  InscriptionTier,
  MARCHES_LIMIT,
  PairRow,
  RARITIES,
  SLOTS,
  rowsFor,
} from './settings';
import { EvalTexts } from './texts';
import { EvalTip } from './tip';

type Path = readonly (string | number)[];

interface NumField {
  path: Path;
  label: string;
  /** the explanation behind the "i" (Slim 13. 10. 2026) */
  tip?: string;
}

type InscriptionShow = 'top' | 'special' | 'rare' | 'common' | 'tiered';

const RARITY_ORDER: Record<InscriptionRarity, number> = { special: 0, rare: 1, common: 2 };

/** the sections opened last time (a per-viewer convenience: the page works without it) */
const OPEN_KEY = 'kd1035.evaluation.open';

function readOpen(): Set<string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(OPEN_KEY) ?? '[]');
    return new Set(Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

/**
 * "Premenné" of /vyhodnocovanie: every variable of the evaluation in sections (acclaim, power, marches, armaments,
 * the inscription tier list, equipment, commander pairs, the commanders' formations), each with an
 * explanation behind an "i". The sections are closed until opened (Gether 14. 10. 2026: "nech si admin otvorí, čo
 * potrebuje"); the browser remembers which were open. A change
 * goes into the draft at once (on change, not on every key – a number half typed must not jump); the page saves it
 * with "Uložiť" – the pair table into its own table in the database.
 */
@Component({
  selector: 'app-eval-settings',
  imports: [Icon, NgTemplateOutlet, EvalTip],
  templateUrl: './settings-tab.html',
  styleUrls: ['./settings-tab.scss', './settings-tables.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EvalSettingsTab {
  readonly settings = model.required<EvalSettings>();
  readonly evaluation = input.required<Evaluation>();
  readonly players = input<EvalPlayer[]>([]);
  /** every commander a march may name – the pair table suggests them and marks a name not among them */
  readonly commanders = input<string[]>([]);
  /** the catalog: the inscriptions of the tier list */
  readonly armory = input<ArmoryIndex | null>(null);
  readonly texts = input.required<EvalTexts>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  protected readonly kinds = MARCH_KINDS;
  protected readonly rarities = RARITIES;
  protected readonly slots = SLOTS;
  protected readonly inscriptionTiers = INSCRIPTION_TIERS;
  protected readonly limit = MARCHES_LIMIT;

  // ---------------------------------------------------------------- values by path

  protected value(path: Path): number {
    let at: unknown = this.settings();
    for (const key of path) at = (at as Record<string | number, unknown>)?.[key];
    return typeof at === 'number' ? at : 0;
  }

  private change(mutate: (draft: EvalSettings) => void): void {
    const draft = structuredClone(this.settings());
    mutate(draft);
    this.settings.set(draft);
  }

  private put(path: Path, value: unknown): void {
    this.change((draft) => {
      let at = draft as unknown as Record<string | number, unknown>;
      for (const key of path.slice(0, -1)) at = at[key] as Record<string | number, unknown>;
      at[path[path.length - 1]] = value;
    });
  }

  /** a number field: an empty or broken value puts the field back */
  protected setNumber(path: Path, event: Event): void {
    const box = event.target as HTMLInputElement;
    const value = Number(box.value.replace(',', '.'));
    if (box.value.trim() === '' || !Number.isFinite(value)) {
      box.value = String(this.value(path));
      return;
    }
    this.put(path, value);
  }

  protected setFlag(path: Path, event: Event): void {
    this.put(path, (event.target as HTMLInputElement).checked);
  }

  protected id(path: Path): string {
    return 'ev-' + path.join('-');
  }

  // ---------------------------------------------------------------- explanations

  protected tip(key: string): string {
    return this.texts().tips[key] ?? '';
  }

  protected tipLabel(label: string): string {
    return this.texts().tipLabel.replace('{label}', label);
  }

  // ---------------------------------------------------------------- the fields of each section

  protected readonly fields = computed(() => {
    const s = this.texts().sections;
    const f = (path: Path, label: string): NumField => ({ path, label, tip: this.tip(path.join('.')) });
    return {
      acclaim: [
        f(['acclaim', 'benchmark'], s.acclaim.benchmark),
        // the three parts and their weights (Gether 23. 10. 2026)
        f(['acclaim', 'powerBase'], s.acclaim.powerBase),
        f(['acclaim', 'weights', 'power'], s.acclaim.weights.power),
        f(['acclaim', 'weights', 'marches'], s.acclaim.weights.marches),
        f(['acclaim', 'weights', 'quality'], s.acclaim.weights.quality),
        f(['acclaim', 'minimum'], s.acclaim.minimum),
        f(['acclaim', 'round'], s.acclaim.round),
        f(['acclaim', 't4'], s.acclaim.t4),
      ],
      score: f(['acclaim', 'score'], s.acclaim.score),
      benchmarkPower: f(['acclaim', 'power'], s.acclaim.power),
      power: [
        f(['power', 'spread'], s.power.spread),
        f(['power', 'excess'], s.power.excess),
        f(['power', 'floor'], s.power.floor),
      ],
      powerAuto: [f(['power', 'low'], s.power.low), f(['power', 'high'], s.power.high), f(['power', 'samples'], s.power.samples)],
      marches: [
        f(['marches', 'equipment'], s.marches.equipment),
        f(['marches', 'armaments'], s.marches.armaments),
      ],
      armaments: (
        ['attack', 'defense', 'health', 'damage', 'combatMax', 'statsWeight', 'inscWeight', 'gold', 'blue', 'white', 'inscMax'] as const
      ).map((key) => f(['armaments', key], s.armaments[key])),
      inscriptionTiers: INSCRIPTION_TIERS.map((tier): NumField => ({ path: ['armaments', 'tiers', tier], label: `Tier ${tier}` })),
      equipment: [f(['equipment', 'statsWeight'], s.equipment.statsWeight), f(['equipment', 'statsMax'], s.equipment.statsMax)],
      pairs: (['minimum', 'curve'] as const).map((key) => f(['pairs', key], s.pairs[key])),
      formations: f(['formations', 'wrong'], s.formations.wrong),
    };
  });

  // ---------------------------------------------------------------- acclaim

  /** players with a score – one of them may be the benchmark */
  protected readonly benchmarkPlayers = computed(() =>
    this.evaluation()
      .rows.filter((r) => r.score > 0 && r.player.approved)
      .map((r) => ({ id: r.player.id, name: r.player.ingame_name || r.player.name, score: r.score }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );

  protected setBenchmarkPlayer(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.put(['acclaim', 'player'], value ? Number(value) : null);
  }

  // ---------------------------------------------------------------- marches

  protected toggleKind(kind: MarchKind): void {
    this.change((draft) => {
      const kinds = new Set(draft.marches.kinds);
      if (kinds.has(kind)) kinds.delete(kind);
      else kinds.add(kind);
      draft.marches.kinds = MARCH_KINDS.filter((k) => kinds.has(k));
    });
  }

  /** the marches counted: the power table grows or shrinks with it */
  protected setMax(event: Event): void {
    const box = event.target as HTMLInputElement;
    const value = Math.round(Number(box.value));
    if (!Number.isFinite(value) || value < 1 || value > MARCHES_LIMIT) {
      box.value = String(this.settings().marches.max);
      return;
    }
    this.change((draft) => {
      draft.marches.max = value;
      draft.power.table = rowsFor(value, draft.power.table);
    });
  }

  // ---------------------------------------------------------------- the inscription tier list

  protected readonly inscriptionFilter = signal('');
  protected readonly inscriptionShow = signal<InscriptionShow>('top');
  protected readonly inscriptionShows: InscriptionShow[] = ['top', 'special', 'rare', 'common', 'tiered'];

  /** every inscription of the catalog once by its name: its colour, the formations that have it, its tier and points */
  protected readonly inscriptionRows = computed(() => {
    const index = this.armory();
    if (!index) return [];
    const settings = this.settings();
    const all = this.texts().sections.inscriptions.all;
    const found = new Map<string, { name: string; rarity: InscriptionRarity; formations: string[] }>();
    for (const formation of index.data.formations) {
      for (const i of formation.inscriptions) {
        const entry = found.get(i.name) ?? { name: i.name, rarity: i.rarity, formations: [] };
        entry.formations.push(formation.name);
        found.set(i.name, entry);
      }
    }
    for (const i of index.data.common) {
      if (!found.has(i.name)) found.set(i.name, { name: i.name, rarity: i.rarity, formations: [] });
    }
    const query = fold(this.inscriptionFilter());
    const show = this.inscriptionShow();
    return [...found.values()]
      .map((i) => ({
        ...i,
        formations: i.formations.length ? i.formations.join(', ') : all,
        tier: settings.armaments.inscriptions[i.name] ?? null,
        points: inscriptionValue(settings, i),
      }))
      .filter((i) => {
        if (show === 'top' && i.rarity === 'common') return false;
        if ((show === 'special' || show === 'rare' || show === 'common') && i.rarity !== show) return false;
        if (show === 'tiered' && !i.tier) return false;
        return !query || fold(`${i.name} ${i.formations}`).includes(query);
      })
      .sort((a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity] || a.name.localeCompare(b.name));
  });

  protected colourPoints(rarity: InscriptionRarity): number {
    const a = this.settings().armaments;
    return rarity === 'special' ? a.gold : rarity === 'rare' ? a.blue : a.white;
  }

  protected setInscriptionTier(name: string, event: Event): void {
    const tier = (event.target as HTMLSelectElement).value as InscriptionTier | '';
    this.change((draft) => {
      if (tier) draft.armaments.inscriptions[name] = tier;
      else delete draft.armaments.inscriptions[name];
    });
  }

  // ---------------------------------------------------------------- pairs

  protected readonly pairFilter = signal('');
  /** the rows with their index in the table, filtered by a name */
  protected readonly pairRows = computed(() => {
    const query = fold(this.pairFilter());
    return this.settings()
      .pairs.rows.map((row, index) => ({ row, index }))
      .filter(({ row }) => !query || fold(`${row[0]} ${row[1]}`).includes(query));
  });
  protected readonly missing = computed(() => missingPairs(this.settings(), this.players()));
  private readonly known = computed(() => new Set(this.commanders().map(fold)));

  /** a name a march cannot have – the server would refuse it (the list loaded, the name filled in) */
  protected unknown(name: string | number): boolean {
    const text = String(name).trim();
    return !!text && this.known().size > 0 && !this.known().has(fold(text));
  }

  /** the factor of 5511 on one commander and on both with the variables now */
  protected readonly skillExample = computed(() => {
    const s = this.settings();
    const m = (primary: string, secondary: string): March =>
      ({ id: 0, position: 0, kind: '', primary: 'A', secondary: 'B', primary_skills: primary, secondary_skills: secondary }) as March;
    const format = (n: number) => n.toFixed(2).replace('.', ',');
    return this.texts()
      .sections.pairs.example.replace('{a}', format(skillFactor(s, m('5511', '5555'))))
      .replace('{b}', format(skillFactor(s, m('5511', '5511'))));
  });

  /** a new row on top with 0 points (= not evaluated yet), the cursor in it – the points or the first name */
  protected addPair(primary = '', secondary = ''): void {
    this.change((draft) => draft.pairs.rows.unshift([primary, secondary, 0]));
    this.pairFilter.set('');
    afterNextRender(
      () => {
        const row = this.host.nativeElement.querySelector('.ev-table--pairs tbody tr');
        row?.querySelector<HTMLInputElement>(primary ? '.ev-input--points' : 'input')?.focus();
      },
      { injector: this.injector },
    );
  }

  protected removePair(index: number): void {
    this.change((draft) => draft.pairs.rows.splice(index, 1));
  }

  protected setPair(index: number, column: 0 | 1 | 2, event: Event): void {
    const box = event.target as HTMLInputElement;
    this.change((draft) => {
      const row: PairRow = draft.pairs.rows[index];
      if (column === 2) {
        const value = Number(box.value.replace(',', '.'));
        if (Number.isFinite(value) && box.value.trim() !== '') row[2] = Math.min(500, Math.max(0, value));
        else box.value = String(row[2]);
      } else {
        row[column] = box.value.trim();
      }
    });
  }

  protected used(n: number): string {
    return this.texts().sections.pairs.used.replace('{n}', String(n));
  }

  protected reversedText(points: number): string {
    return this.texts().sections.pairs.reversed.replace('{n}', String(points).replace('.', ','));
  }

  // ---------------------------------------------------------------- the sections

  /** the page runs in the browser only (the data comes from the API) – read once */
  private readonly opened = signal<ReadonlySet<string>>(readOpen());

  protected isOpen(key: string): boolean {
    return this.opened().has(key);
  }

  protected toggled(key: string, event: Event): void {
    const open = (event.target as HTMLDetailsElement).open;
    if (open === this.opened().has(key)) return;
    const next = new Set(this.opened());
    if (open) next.add(key);
    else next.delete(key);
    this.opened.set(next);
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify([...next]));
    } catch {
      // a private window: the sections close again next time
    }
  }

  // ---------------------------------------------------------------- formations

  protected readonly formationFilter = signal('');
  /** the formations of the catalog, by name */
  protected readonly formationList = computed(() =>
    [...(this.armory()?.formations.values() ?? [])].map((f) => ({ id: f.id, name: f.name })).sort((a, b) => a.name.localeCompare(b.name)),
  );

  /**
   * Every commander of the pair table and of the formation table, with its formations and how many marches of the
   * players he leads in another one (of the types that count)
   */
  protected readonly formationRows = computed(() => {
    const s = this.settings();
    const query = fold(this.formationFilter());
    const formations = formationTable(s);
    const kinds = new Set(s.marches.kinds);
    const names = new Map<string, string>();
    for (const name of [...Object.keys(s.formations.byCommander), ...s.pairs.rows.flatMap(([p, q]) => [p, q])]) {
      if (name.trim() && !names.has(fold(name))) names.set(fold(name), name.trim());
    }
    const off = new Map<string, number>();
    for (const player of this.players()) {
      for (const m of player.marches) {
        if (!m.kind || !kinds.has(m.kind) || formationOf(formations, m).ok !== false) continue;
        off.set(fold(m.primary), (off.get(fold(m.primary)) ?? 0) + 1);
      }
    }
    return [...names]
      .filter(([key]) => !query || key.includes(query))
      .map(([key, name]) => ({ name, ids: formations.get(key) ?? [], off: off.get(key) ?? 0 }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  /** the first or the second formation of a commander; no first = any formation */
  protected setFormation(name: string, slot: 0 | 1, event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    this.change((draft) => {
      const table = draft.formations.byCommander;
      const key = Object.keys(table).find((k) => fold(k) === fold(name)) ?? name;
      const ids = [...(table[key] ?? [])];
      if (slot === 0) ids[0] = id;
      else ids[1] = id;
      const clean = [...new Set(ids.filter((v) => !!v))];
      const result = slot === 0 && !id ? [] : clean;
      if (result.length) table[key] = result;
      else delete table[key];
      // in the order the page loads them, so a change made and undone is not "unsaved"
      draft.formations.byCommander = Object.fromEntries(Object.entries(table).sort(([a], [b]) => a.localeCompare(b)));
    });
  }

  // ---------------------------------------------------------------- power

  protected rangeNow(i: number): string {
    const range = this.evaluation().ranges[i];
    const s = this.texts().sections.power;
    const format = (n: number) => n.toFixed(1).replace('.', ',');
    return range.auto
      ? s.autoNow.replace('{min}', format(range.min)).replace('{max}', format(range.max)).replace('{n}', String(range.players))
      : s.fixedNow.replace('{n}', String(range.players));
  }
}

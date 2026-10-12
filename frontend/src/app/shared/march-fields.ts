import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { I18n } from '../core/i18n/i18n';
import {
  ARMAMENT_STATS,
  INSCRIPTIONS,
  MARCH_KINDS,
  MARCH_STATS,
  MarchKind,
  OPTIONAL_STATS,
  MarchStat,
  STAT_MAX,
  UploadError,
  marchIcon,
} from '../core/kvk-api';
import { MarchCommander } from '../core/marches-api';
import { Icon } from './icon';
import { formatBonus, readBonus, statLabel } from './stat-label';
import { fold } from './search';

export type ShotKind = 'equipment' | 'armaments';
export const SHOT_KINDS: ShotKind[] = ['equipment', 'armaments'];
type Slot = 'primary' | 'secondary';
/** all four skills at level 5 */
export const EXPERTISE = '5555';
/** a commander who is not expertise starts at 5111 (Gether 12. 10. 2026) */
const NOT_EXPERTISE = '5111';

/** a screenshot already on the server (KvkImage – a march has no screenshot since 12. 10. 2026) */
export interface SavedShot {
  id: number;
  kind: ShotKind;
  thumb: string;
}

/** a screenshot chosen in the editor, not uploaded yet: the file and its local preview (object URL) */
export interface ChosenShot {
  file: File;
  preview: string;
}

/**
 * An army being filled in – a march or a KvK sign-up (Gether 11. 10. 2026: the sign-up is filled in like a march).
 * Nothing is sent before the page saves it. Each kind of screenshot is either kept (on the server) or newly chosen.
 */
export interface ArmyDraft {
  kind: MarchKind | '';
  primary: string;
  secondary: string;
  /** armament bonuses and inscriptions, null = empty field */
  stats: Record<MarchStat, number | null>;
  /** the commanders' skill levels, four digits 1–5 (5555 = expertise, the default) */
  skills: Record<Slot, string>;
  keep: Partial<Record<ShotKind, SavedShot>>;
  chosen: Partial<Record<ShotKind, ChosenShot>>;
  /** saved screenshots the player removed – deleted when the page saves */
  removed: SavedShot[];
}

export type ArmyError = 'kind' | 'primary' | ShotKind | 'stats';

/** what a form requires besides the primary commander */
export interface ArmyRules {
  /** the march type */
  kind: boolean;
  /** the screenshots */
  shots: ShotKind[];
  /** every bonus and inscription count (0 counts) – but All DMG, which is 0 when left empty (Gether 11. 10. 2026) */
  stats: boolean;
  /** the inscription counts are typed in (a KvK sign-up); a march counts its inscriptions clicked together */
  counts?: boolean;
}

export { OPTIONAL_STATS } from '../core/kvk-api';

/** the draft of a saved march or sign-up (or an empty one) */
export function armyDraft(
  source?: Partial<Record<MarchStat, number | null>> & {
    kind?: MarchKind | '';
    primary?: string;
    secondary?: string;
    images?: { id: number; kind: string; thumb: string }[];
    primary_skills?: string;
    secondary_skills?: string;
  } | null,
): ArmyDraft {
  const stats = Object.fromEntries(MARCH_STATS.map((stat) => [stat, source?.[stat] ?? null])) as ArmyDraft['stats'];
  const keep: ArmyDraft['keep'] = {};
  for (const kind of SHOT_KINDS) {
    const image = source?.images?.find((i) => i.kind === kind);
    if (image) keep[kind] = { id: image.id, kind, thumb: image.thumb };
  }
  return {
    kind: source?.kind ?? '',
    primary: source?.primary ?? '',
    secondary: source?.secondary ?? '',
    stats,
    skills: { primary: source?.primary_skills ?? EXPERTISE, secondary: source?.secondary_skills ?? EXPERTISE },
    keep,
    chosen: {},
    removed: [],
  };
}

/** the first missing part, checked in the order of the editor */
export function armyError(draft: ArmyDraft, rules: ArmyRules): ArmyError | null {
  if (rules.kind && !draft.kind) return 'kind';
  if (!draft.primary) return 'primary';
  const shot = rules.shots.find((kind) => !draft.keep[kind] && !draft.chosen[kind]);
  if (shot) return shot;
  const typed: readonly MarchStat[] = rules.counts === false ? ARMAMENT_STATS : MARCH_STATS;
  if (rules.stats && typed.some((stat) => draft.stats[stat] === null && !OPTIONAL_STATS.includes(stat))) {
    return 'stats';
  }
  return null;
}

/** frees the previews of the chosen screenshots */
export function releaseArmy(draft: ArmyDraft | null): void {
  for (const chosen of Object.values(draft?.chosen ?? {})) if (chosen) URL.revokeObjectURL(chosen.preview);
}

/**
 * The fields of a march (Gether 11. 10. 2026): the type as icons (optional), two commander tiles and the screenshots
 * as square tiles with an example (only the KvK sign-up – a march clicks its equipment together since 12. 10. 2026),
 * the armament bonuses and the inscription counts (two digits, rounded up) – a march types its bonuses in the build
 * editor and counts its clicked inscriptions (`withStats`, `withCounts`).
 * The commander picker and the example are dialogs. Used by "Prehľad marchov" (/marche) and the KvK sign-up (/kvk).
 */
@Component({
  selector: 'app-march-fields',
  imports: [Icon],
  templateUrl: './march-fields.html',
  styleUrl: './march-fields.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarchFields {
  readonly value = input.required<ArmyDraft>();
  readonly valueChange = output<ArmyDraft>();
  /** every commander with a portrait; `pick` ones are offered */
  readonly commanders = input<MarchCommander[]>([]);
  /** the march type is part of the form */
  readonly withKind = input(true);
  /** the types offered (a KvK sign-up: cavalry, infantry, archers) */
  readonly kinds = input<MarchKind[]>(MARCH_KINDS);
  /** the screenshots of the form (a march has none since 12. 10. 2026 – its equipment is clicked together) */
  readonly shotKinds = input<ShotKind[]>(SHOT_KINDS);
  /** the inscription counts are typed in (a KvK sign-up); a march counts the inscriptions clicked together */
  readonly withCounts = input(true);
  /** the armament bonuses are part of the form (a KvK sign-up); a march types them in its build editor */
  readonly withStats = input(true);
  /** the commanders' skill levels (a march; Gether 12. 10. 2026: expertise by default, else e.g. 5111) */
  readonly withSkills = input(false);
  /** an empty All DMG is saved as 0 – the field shows it as its placeholder */
  readonly damageDefaultsToZero = input(false);
  readonly error = input<ArmyError | null>(null);
  readonly uploadError = input<{ kind: ShotKind; error: UploadError } | null>(null);
  /** what is filled in ("2. march"), above the picker's title */
  readonly heading = input('');
  /** keeps the ids unique when the page has more forms */
  readonly idPrefix = input('army');

  protected readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.t().marches);
  protected readonly slots: Slot[] = ['primary', 'secondary'];
  protected readonly armamentStats = ARMAMENT_STATS;
  protected readonly inscriptionKinds = INSCRIPTIONS;
  protected readonly icon = marchIcon;

  /** the value with the changes not yet passed back down (two quick inputs in a row must not lose the first) */
  protected readonly current = linkedSignal(() => this.value());
  private readonly portraits = computed(() => new Map(this.commanders().map((c) => [c.name, c.icon])));
  private readonly offered = computed(() => this.commanders().filter((c) => c.pick));
  private opener: HTMLElement | null = null;

  protected portrait(name: string): string | undefined {
    return this.portraits().get(name);
  }

  private patch(change: Partial<ArmyDraft>): void {
    const next = { ...this.current(), ...change };
    this.current.set(next);
    this.valueChange.emit(next);
  }

  protected setKind(kind: MarchKind): void {
    this.patch({ kind: this.current().kind === kind ? '' : kind });
  }

  protected statLabel(stat: (typeof ARMAMENT_STATS)[number]): string {
    return statLabel(this.t(), this.withKind() ? this.current().kind : '', stat);
  }

  /** an armament bonus: one decimal at most (Gether 12. 10. 2026), anything else typed is dropped at once */
  protected setBonus(stat: MarchStat, event: Event): void {
    this.patch({ stats: { ...this.current().stats, [stat]: readBonus(event.target as HTMLInputElement) } });
  }

  protected readonly bonus = formatBonus;

  /** an inscription count: a whole number of at most two digits; anything else typed is dropped at once */
  protected setStat(stat: MarchStat, event: Event): void {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '').slice(0, 2);
    if (input.value !== digits) input.value = digits;
    const value = digits === '' ? null : Math.min(Number(digits), STAT_MAX);
    this.patch({ stats: { ...this.current().stats, [stat]: value } });
  }

  // ---------------------------------------------------------------- commander skills

  protected readonly skillIndexes = [0, 1, 2, 3];
  protected readonly skillLevels = ['1', '2', '3', '4', '5'];
  protected readonly expertise = EXPERTISE;

  /** expertise on = 5555, off = 5111 to start from */
  protected toggleExpertise(slot: Slot): void {
    const skills = this.current().skills;
    this.patch({ skills: { ...skills, [slot]: skills[slot] === EXPERTISE ? NOT_EXPERTISE : EXPERTISE } });
  }

  /** one skill 1–5; four fives make the commander expertise again */
  protected setSkill(slot: Slot, index: number, event: Event): void {
    const level = (event.target as HTMLSelectElement).value;
    const skills = this.current().skills;
    const next = skills[slot].slice(0, index) + level + skills[slot].slice(index + 1);
    this.patch({ skills: { ...skills, [slot]: next } });
  }

  // ---------------------------------------------------------------- screenshots

  /** the screenshot shown for a kind: newly chosen, or the saved one */
  protected shotOf(kind: ShotKind): string | null {
    const draft = this.current();
    return draft.chosen[kind]?.preview ?? draft.keep[kind]?.thumb ?? null;
  }

  protected choose(kind: ShotKind, input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.replaceShot(kind, { file, preview: URL.createObjectURL(file) });
  }

  protected unchoose(kind: ShotKind): void {
    this.replaceShot(kind, undefined);
  }

  private replaceShot(kind: ShotKind, chosen: ChosenShot | undefined): void {
    const d = this.current();
    const old = d.chosen[kind];
    if (old) URL.revokeObjectURL(old.preview);
    const removed = d.keep[kind] ? [...d.removed, d.keep[kind]!] : d.removed;
    this.patch({ keep: { ...d.keep, [kind]: undefined }, removed, chosen: { ...d.chosen, [kind]: chosen } });
  }

  // ---------------------------------------------------------------- example screenshot (dialog)

  protected readonly example = signal<ShotKind | null>(null);
  private readonly exampleDialog = viewChild<ElementRef<HTMLDialogElement>>('exampleDialog');

  protected showExample(kind: ShotKind, event: Event): void {
    this.opener = event.currentTarget as HTMLElement;
    this.example.set(kind);
    this.exampleDialog()?.nativeElement.showModal();
  }

  protected closeExample(): void {
    this.exampleDialog()?.nativeElement.close();
  }

  protected exampleClosed(): void {
    this.example.set(null);
    this.opener?.focus();
  }

  // ---------------------------------------------------------------- commander picker (dialog)

  protected readonly picking = signal<Slot | null>(null);
  protected readonly search = signal('');
  protected readonly shown = computed(() => {
    const query = fold(this.search());
    return query ? this.offered().filter((c) => fold(c.name).includes(query)) : this.offered();
  });
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('picker');

  protected openPicker(slot: Slot, event: Event): void {
    this.opener = event.currentTarget as HTMLElement;
    this.search.set('');
    this.picking.set(slot);
    this.dialog()?.nativeElement.showModal();
  }

  protected pick(name: string): void {
    const slot = this.picking();
    if (slot) this.patch({ [slot]: name });
    this.closePicker();
  }

  protected closePicker(): void {
    this.dialog()?.nativeElement.close();
  }

  protected pickerClosed(): void {
    this.picking.set(null);
    this.opener?.focus();
  }
}

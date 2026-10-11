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
  MarchStat,
  STAT_MAX,
  UploadError,
  marchIcon,
} from '../core/kvk-api';
import { MarchCommander } from '../core/marches-api';
import { Icon } from './icon';
import { statLabel } from './march-row';
import { fold } from './search';

export type ShotKind = 'equipment' | 'armaments';
export const SHOT_KINDS: ShotKind[] = ['equipment', 'armaments'];
/** a march has only the equipment screenshot – its armaments are typed in (Gether 11. 10. 2026); the KvK sign-up both */
export const MARCH_SHOTS: ShotKind[] = ['equipment'];
type Slot = 'primary' | 'secondary';

/** a screenshot already on the server (MarchImage, KvkImage) */
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
  /** every bonus and inscription count (0 counts) */
  stats: boolean;
}

/** the draft of a saved march or sign-up (or an empty one) */
export function armyDraft(
  source?: Partial<Record<MarchStat, number | null>> & {
    kind?: MarchKind | '';
    primary?: string;
    secondary?: string;
    images?: { id: number; kind: string; thumb: string }[];
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
  if (rules.stats && MARCH_STATS.some((stat) => draft.stats[stat] === null)) return 'stats';
  return null;
}

/** frees the previews of the chosen screenshots */
export function releaseArmy(draft: ArmyDraft | null): void {
  for (const chosen of Object.values(draft?.chosen ?? {})) if (chosen) URL.revokeObjectURL(chosen.preview);
}

/**
 * The fields of a march (Gether 11. 10. 2026): the type as icons (optional), two commander tiles and the two
 * screenshots as square tiles with an example, the armament bonuses and inscriptions (two digits, rounded up). The
 * commander picker and the example are dialogs. Used by "Moje marche" (/marche) and the KvK sign-up (/kvk).
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
  /** the march type is part of the form (a KvK sign-up has the role instead) */
  readonly withKind = input(true);
  /** the screenshots of the form */
  readonly shotKinds = input<ShotKind[]>(SHOT_KINDS);
  readonly error = input<ArmyError | null>(null);
  readonly uploadError = input<{ kind: ShotKind; error: UploadError } | null>(null);
  /** what is filled in ("2. march"), above the picker's title */
  readonly heading = input('');
  /** keeps the ids unique when the page has more forms */
  readonly idPrefix = input('army');

  protected readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.t().marches);
  protected readonly kinds = MARCH_KINDS;
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

  /** whole numbers of at most two digits; anything else typed is dropped at once (no decimals – rounded up) */
  protected setStat(stat: MarchStat, event: Event): void {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '').slice(0, 2);
    if (input.value !== digits) input.value = digits;
    const value = digits === '' ? null : Math.min(Number(digits), STAT_MAX);
    this.patch({ stats: { ...this.current().stats, [stat]: value } });
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

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
import { MARCH_KINDS, MarchKind, marchIcon } from '../core/kvk-api';
import { MarchCommander } from '../core/marches-api';
import { Icon } from './icon';
import { fold } from './search';

type Slot = 'primary' | 'secondary';
/** all four skills at level 5 */
export const EXPERTISE = '5555';
/** a commander who is not expertise starts at 5111 (Gether 12. 10. 2026) */
const NOT_EXPERTISE = '5111';

/**
 * The form of a march or a KvK sign-up (Gether 11. and 12. 10. 2026: the sign-up is filled in exactly like a march):
 * the type and the commanders with their skill levels. Their equipment, armaments and bonuses are clicked together in
 * the build editor afterwards. Nothing is sent before the page saves it.
 */
export interface ArmyDraft {
  kind: MarchKind | '';
  primary: string;
  secondary: string;
  /** the commanders' skill levels, four digits 1–5 (5555 = expertise, the default) */
  skills: Record<Slot, string>;
}

export type ArmyError = 'kind' | 'primary';

/** the draft of a saved march or sign-up (or an empty one) */
export function armyDraft(
  source?: { kind?: MarchKind | ''; primary?: string; secondary?: string; primary_skills?: string; secondary_skills?: string } | null,
): ArmyDraft {
  return {
    kind: source?.kind ?? '',
    primary: source?.primary ?? '',
    secondary: source?.secondary ?? '',
    skills: { primary: source?.primary_skills ?? EXPERTISE, secondary: source?.secondary_skills ?? EXPERTISE },
  };
}

/** the first missing part, in the order of the form: the type, the primary commander */
export function armyError(draft: ArmyDraft): ArmyError | null {
  if (!draft.kind) return 'kind';
  if (!draft.primary) return 'primary';
  return null;
}

/**
 * The fields of a march or a KvK sign-up: the type as icons, two commander tiles (the picker is a dialog with a grid of
 * heads) and the commanders' skill levels – expertise by default, else four levels 1–5 (Gether 12. 10. 2026). Used by
 * "Prehľad marchov" (/marche) and the KvK sign-up (/kvk).
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
  /** the types offered (a KvK sign-up: cavalry, infantry, archers) */
  readonly kinds = input<MarchKind[]>(MARCH_KINDS);
  readonly error = input<ArmyError | null>(null);
  /** what is filled in ("2. march"), above the picker's title */
  readonly heading = input('');
  /** keeps the ids unique when the page has more forms */
  readonly idPrefix = input('army');

  protected readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.t().marches);
  protected readonly slots: Slot[] = ['primary', 'secondary'];
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

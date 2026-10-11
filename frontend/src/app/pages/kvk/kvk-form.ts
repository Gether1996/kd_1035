import { isPlatformBrowser } from '@angular/common';
import { httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n } from '../../core/i18n/i18n';
import { IMAGE_KINDS, KvkApi, KvkImage, KvkRound, KvkSignup, KvkState, UploadError } from '../../core/kvk-api';
import { MarchCommander, marchCommandersUrl } from '../../core/marches-api';
import { Icon } from '../../shared/icon';
import { ArmyDraft, ArmyError, MarchFields, SHOT_KINDS, ShotKind, armyDraft, armyError, releaseArmy } from '../../shared/march-fields';

/**
 * The player's KvK sign-up on /kvk: in-game name, rally / garrison and the army filled in like a march (Gether
 * 11. 10. 2026: MarchFields – commander pair, a screenshot of the equipment and of the armaments, armament bonuses),
 * a note. Nothing is sent before "Prihlásiť sa"; only the reviewers and the superuser see it.
 */
@Component({
  selector: 'app-kvk-form',
  imports: [Icon, MarchFields, RouterLink],
  templateUrl: './kvk-form.html',
  styleUrl: './kvk.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KvkForm {
  readonly state = input.required<KvkState>();
  /** the sign-up changed or was withdrawn – the page asks for the state again */
  readonly changed = output<void>();

  private readonly api = inject(KvkApi);
  protected readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.t().kvk);

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly commanderData = httpResource<MarchCommander[]>(() => (this.isBrowser ? marchCommandersUrl : undefined));
  protected readonly commanders = computed(() => (this.commanderData.hasValue() ? this.commanderData.value() : []));

  /** the sign-up of the open round – the form starts from it (an older round's sign-up does not fill it) */
  protected readonly signup = linkedSignal<KvkSignup | null>(() => this.state().signup);
  /** sign-ups of closed rounds: read only, the screenshots and the whole sign-up may be deleted */
  protected readonly older = linkedSignal(() => this.state().older);
  protected readonly ingameName = linkedSignal(() => this.state().ingame_name);
  protected readonly rally = linkedSignal(() => this.state().signup?.rally ?? false);
  protected readonly garrison = linkedSignal(() => this.state().signup?.garrison ?? false);
  protected readonly note = linkedSignal(() => this.state().signup?.note ?? '');
  protected readonly army = linkedSignal<ArmyDraft>(() => armyDraft(this.state().signup));

  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly formError = signal<'name' | 'role' | 'failed' | null>(null);
  protected readonly armyProblem = signal<ArmyError | null>(null);
  protected readonly uploadError = signal<{ kind: ShotKind; error: UploadError } | null>(null);
  /** the sign-up whose withdraw waits for the confirmation: 'open' or an older round's id */
  protected readonly confirmWithdraw = signal<'open' | number | null>(null);

  protected readonly title = computed(() => {
    const round = this.state().round;
    return round ? this.roundTitle(round) : '';
  });

  protected roundTitle(round: KvkRound): string {
    return (this.i18n.lang() === 'cs' && round.title_cs) || round.title_sk;
  }

  /** the screenshots of a sign-up in the order of the kinds */
  protected ordered(signup: KvkSignup): KvkImage[] {
    return IMAGE_KINDS.flatMap((kind) => signup.images.filter((image) => image.kind === kind));
  }

  protected setArmy(value: ArmyDraft): void {
    this.army.set(value);
    this.armyProblem.set(null);
    this.uploadError.set(null);
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    if (this.saving()) return;
    const army = this.army();
    this.formError.set(null);
    this.armyProblem.set(null);
    if (!this.ingameName().trim()) return this.formError.set('name');
    if (!this.rally() && !this.garrison()) return this.formError.set('role');
    const missing = armyError(army, false);
    if (missing) return this.armyProblem.set(missing);
    this.saving.set(true);
    try {
      const first = !this.signup();
      let signup = await this.api.saveSignup({
        ingame_name: this.ingameName().trim(),
        rally: this.rally(),
        garrison: this.garrison(),
        primary: army.primary,
        secondary: army.secondary,
        ...army.stats,
        note: this.note().trim(),
      });
      for (const image of army.removed) await this.api.removeImage(image.id);
      signup = { ...signup, images: signup.images.filter((i) => !army.removed.some((r) => r.id === i.id)) };
      // the sign-up exists now: a failed upload keeps the chosen file, the player only picks that one again
      let current: ArmyDraft = { ...army, removed: [] };
      for (const kind of SHOT_KINDS) {
        const chosen = current.chosen[kind];
        if (!chosen) continue;
        const result = await this.api.upload(kind, chosen.file);
        if (typeof result === 'string') {
          this.uploadError.set({ kind, error: result });
          break;
        }
        URL.revokeObjectURL(chosen.preview);
        signup = { ...signup, images: [...signup.images, result] };
        current = { ...current, keep: { ...current.keep, [kind]: result }, chosen: { ...current.chosen, [kind]: undefined } };
      }
      signup = { ...signup, complete: IMAGE_KINDS.every((kind) => signup.images.some((i) => i.kind === kind)) };
      this.signup.set(signup);
      this.army.set(current);
      if (!this.uploadError()) {
        this.saved.set(true);
        setTimeout(() => this.saved.set(false), 3000);
      }
      if (first) this.changed.emit();
    } catch {
      this.formError.set('failed');
    } finally {
      this.saving.set(false);
    }
  }

  /** a screenshot of a closed round's sign-up */
  protected async remove(image: KvkImage): Promise<void> {
    try {
      await this.api.removeImage(image.id);
      const without = (s: KvkSignup) => ({ ...s, images: s.images.filter((i) => i.id !== image.id) });
      this.older.update((list) => list.map((o) => ({ ...o, signup: without(o.signup) })));
    } catch {
      this.formError.set('failed');
    }
  }

  protected async withdraw(round?: number): Promise<void> {
    try {
      await this.api.withdraw(round);
      this.confirmWithdraw.set(null);
      if (round) this.older.update((list) => list.filter((o) => o.round.id !== round));
      else {
        releaseArmy(this.army());
        this.signup.set(null);
        this.army.set(armyDraft());
      }
      this.changed.emit();
    } catch {
      this.formError.set('failed');
    }
  }
}

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
import { Auth } from '../../core/auth';
import { I18n } from '../../core/i18n/i18n';
import {
  IMAGE_KINDS,
  KVK_KINDS,
  KVK_ROLES,
  KvkApi,
  KvkRole,
  KvkSignup,
  KvkState,
  UploadError,
} from '../../core/kvk-api';
import { MarchCommander, marchCommandersUrl } from '../../core/marches-api';
import { Icon } from '../../shared/icon';
import { ArmyDraft, ArmyError, MarchFields, SHOT_KINDS, ShotKind, armyDraft, armyError, releaseArmy } from '../../shared/march-fields';

type PerRole<T> = Record<KvkRole, T>;

const perRole = <T,>(make: (role: KvkRole) => T): PerRole<T> => ({ rally: make('rally'), garrison: make('garrison') });

/**
 * The player's KvK sign-ups on /kvk (Gether 11. 10. 2026): the in-game name, then a tab for rally and one for
 * garrison – a player may sign up for both, each with its own army filled in like a march (MarchFields: commander
 * pair, a screenshot of the equipment and of the armaments, armament bonuses) and a note. Nothing is sent before
 * "Prihlásiť sa"; only the reviewers and the superuser see it. No rounds: a sign-up stays for every KvK until the player
 * or the superuser withdraws it; the heading (e.g. the date of the next KvK) is set by the superuser.
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
  /** a sign-up was added or withdrawn – the page asks for the state again */
  readonly changed = output<void>();

  private readonly api = inject(KvkApi);
  private readonly auth = inject(Auth);
  protected readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.t().kvk);
  protected readonly roles = KVK_ROLES;
  protected readonly kinds = KVK_KINDS;

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly commanderData = httpResource<MarchCommander[]>(() => (this.isBrowser ? marchCommandersUrl : undefined));
  protected readonly commanders = computed(() => (this.commanderData.hasValue() ? this.commanderData.value() : []));

  /** the player's sign-ups – the forms start from them */
  protected readonly signups = linkedSignal<PerRole<KvkSignup | null>>(() => this.state().signups);
  protected readonly ingameName = linkedSignal(() => this.state().ingame_name);
  protected readonly notes = linkedSignal(() => perRole((role) => this.state().signups[role]?.note ?? ''));
  protected readonly armies = linkedSignal(() => perRole((role) => armyDraft(this.state().signups[role])));

  /** the tab: rally, or garrison when the player signed up only for that */
  protected readonly role = linkedSignal<KvkRole>(() =>
    !this.state().signups.rally && this.state().signups.garrison ? 'garrison' : 'rally',
  );
  protected readonly signup = computed(() => this.signups()[this.role()]);
  protected readonly army = computed(() => this.armies()[this.role()]);
  protected readonly note = computed(() => this.notes()[this.role()]);

  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly formError = signal<'name' | 'failed' | null>(null);
  protected readonly armyProblem = signal<ArmyError | null>(null);
  protected readonly uploadError = signal<{ kind: ShotKind; error: UploadError } | null>(null);
  /** the role whose withdraw waits for the confirmation */
  protected readonly confirmWithdraw = signal<KvkRole | null>(null);

  /** the heading set by the superuser (e.g. "20.11. najbližšie KvK"); '' = none */
  protected readonly title = computed(() => {
    const s = this.state();
    return (this.i18n.lang() === 'cs' && s.title_cs) || s.title_sk;
  });

  protected showRole(role: KvkRole): void {
    this.role.set(role);
    this.formError.set(null);
    this.armyProblem.set(null);
    this.uploadError.set(null);
    this.confirmWithdraw.set(null);
  }

  protected setArmy(value: ArmyDraft): void {
    this.armies.update((all) => ({ ...all, [this.role()]: value }));
    this.armyProblem.set(null);
    this.uploadError.set(null);
  }

  protected setNote(value: string): void {
    this.notes.update((all) => ({ ...all, [this.role()]: value }));
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    if (this.saving()) return;
    const role = this.role();
    const army = this.army();
    this.formError.set(null);
    this.armyProblem.set(null);
    if (!this.ingameName().trim()) return this.formError.set('name');
    const missing = armyError(army, { kind: true, shots: SHOT_KINDS, stats: false });
    if (missing) return this.armyProblem.set(missing);
    this.saving.set(true);
    try {
      const first = !this.signup();
      let signup = await this.api.saveSignup({
        ingame_name: this.ingameName().trim(),
        role,
        kind: army.kind,
        primary: army.primary,
        secondary: army.secondary,
        ...army.stats,
        note: this.note().trim(),
      });
      // a screenshot replaced by a new one goes on the server only once the new one is stored (a refused upload keeps it)
      const removed = army.removed.filter((image) => !army.chosen[image.kind]);
      for (const image of removed) await this.api.removeImage(image.id);
      signup = { ...signup, images: signup.images.filter((i) => !removed.some((r) => r.id === i.id)) };
      // the sign-up exists now: a failed upload keeps the chosen file, the player only picks that one again
      let current: ArmyDraft = { ...army, removed: [] };
      for (const kind of SHOT_KINDS) {
        const chosen = current.chosen[kind];
        if (!chosen) continue;
        const result = await this.api.upload(role, kind, chosen.file);
        if (typeof result === 'string') {
          this.uploadError.set({ kind, error: result });
          break;
        }
        URL.revokeObjectURL(chosen.preview);
        signup = { ...signup, images: [...signup.images.filter((i) => i.kind !== kind), result] };
        current = { ...current, keep: { ...current.keep, [kind]: result }, chosen: { ...current.chosen, [kind]: undefined } };
      }
      signup = { ...signup, complete: IMAGE_KINDS.every((kind) => signup.images.some((i) => i.kind === kind)) };
      // the sign-up saved the in-game name on the player too: the header drops its red "!"
      if (this.auth.needsName()) this.auth.reload();
      this.signups.update((all) => ({ ...all, [role]: signup }));
      this.armies.update((all) => ({ ...all, [role]: current }));
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

  /** the player's sign-up of a role */
  protected async withdraw(role: KvkRole): Promise<void> {
    try {
      await this.api.withdraw(role);
      this.confirmWithdraw.set(null);
      releaseArmy(this.armies()[role]);
      this.signups.update((all) => ({ ...all, [role]: null }));
      this.armies.update((all) => ({ ...all, [role]: armyDraft() }));
      this.notes.update((all) => ({ ...all, [role]: '' }));
      this.changed.emit();
    } catch {
      this.formError.set('failed');
    }
  }
}

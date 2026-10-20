import { isPlatformBrowser } from '@angular/common';
import { httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  PLATFORM_ID,
  afterNextRender,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { hasBuild } from '../../core/armory';
import { Auth } from '../../core/auth';
import { I18n } from '../../core/i18n/i18n';
import { KVK_KINDS, KVK_ROLES, KvkApi, KvkRole, KvkSignup, KvkState, March, asMarch } from '../../core/kvk-api';
import { MarchChange, MarchCommander, marchCommandersUrl } from '../../core/marches-api';
import { Icon } from '../../shared/icon';
import { MarchBuild } from '../../shared/march-build';
import { ArmyDraft, ArmyError, MarchFields, armyDraft, armyError } from '../../shared/march-fields';
import { BuildEditor } from '../players-marches/build-editor';

type PerRole<T> = Record<KvkRole, T>;

const perRole = <T,>(make: (role: KvkRole) => T): PerRole<T> => ({ rally: make('rally'), garrison: make('garrison') });

/**
 * The player's KvK sign-ups on /kvk – filled in exactly like "Moje marche" (Gether 12. 10. 2026: "žiadne screenshoty
 * a všetko sa dá naklikať, presne ako moje marche"), plus a note. The in-game name, then a tab for rally and one for
 * garrison (a player may sign up for both). Without a sign-up: the form – troops, commanders with their skills, note –
 * and "Prihlásiť sa a naklikať výbavu" opens the build editor. With one: its card (equipment, armaments, bonuses) with
 * "Upraviť výbavu", the pencil for the form, the note and withdrawing. Only the reviewers and the superuser see it; it
 * stays for every KvK until the player or the superuser withdraws it.
 */
@Component({
  selector: 'app-kvk-form',
  imports: [BuildEditor, Icon, MarchBuild, MarchFields, RouterLink],
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
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  protected readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.t().kvk);
  protected readonly roles = KVK_ROLES;
  protected readonly kinds = KVK_KINDS;
  private readonly buildEditor = viewChild.required(BuildEditor);

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly commanderData = httpResource<MarchCommander[]>(() => (this.isBrowser ? marchCommandersUrl : undefined));
  protected readonly commanders = computed(() => (this.commanderData.hasValue() ? this.commanderData.value() : []));
  protected readonly portraits = computed(() => new Map(this.commanders().map((c) => [c.name, c.icon])));

  /** the player's sign-ups – the forms start from them */
  protected readonly signups = linkedSignal<PerRole<KvkSignup | null>>(() => this.state().signups);
  protected readonly ingameName = linkedSignal(() => this.state().ingame_name);
  protected readonly notes = linkedSignal(() => perRole((role) => this.state().signups[role]?.note ?? ''));
  protected readonly armies = linkedSignal(() => perRole((role) => armyDraft(this.state().signups[role])));
  /** the form of a role with a sign-up is open (the pencil) */
  protected readonly editing = signal<KvkRole | null>(null);

  /** the tab: rally, or garrison when the player signed up only for that */
  protected readonly role = linkedSignal<KvkRole>(() =>
    !this.state().signups.rally && this.state().signups.garrison ? 'garrison' : 'rally',
  );
  protected readonly signup = computed(() => this.signups()[this.role()]);
  protected readonly army = computed(() => this.armies()[this.role()]);
  protected readonly note = computed(() => this.notes()[this.role()]);
  /** the form shows without a sign-up and while the pencil is on */
  protected readonly formOpen = computed(() => !this.signup() || this.editing() === this.role());

  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly formError = signal<'name' | 'failed' | null>(null);
  protected readonly armyProblem = signal<ArmyError | null>(null);
  /** the role whose withdraw waits for the confirmation */
  protected readonly confirmWithdraw = signal<KvkRole | null>(null);

  protected readonly asMarch = asMarch;
  protected readonly built = hasBuild;

  /** the build editor saves into the sign-up it was opened for */
  protected readonly saveBuild = (march: March, change: MarchChange): Promise<March> =>
    this.api.saveBuild((march as Partial<KvkSignup>).role ?? this.role(), change).then(asMarch);

  protected showRole(role: KvkRole): void {
    this.role.set(role);
    this.editing.set(null);
    this.formError.set(null);
    this.armyProblem.set(null);
    this.confirmWithdraw.set(null);
  }

  protected setArmy(value: ArmyDraft): void {
    this.armies.update((all) => ({ ...all, [this.role()]: value }));
    this.armyProblem.set(null);
  }

  protected setNote(value: string): void {
    this.notes.update((all) => ({ ...all, [this.role()]: value }));
  }

  /** the pencil: the form of the sign-up shown */
  protected edit(): void {
    this.editing.set(this.role());
  }

  /** "Zrušiť" in the form of a saved sign-up: back to its card, the changes dropped */
  protected cancel(): void {
    const role = this.role();
    const signup = this.signups()[role];
    this.armies.update((all) => ({ ...all, [role]: armyDraft(signup) }));
    this.notes.update((all) => ({ ...all, [role]: signup?.note ?? '' }));
    this.editing.set(null);
    this.armyProblem.set(null);
    this.formError.set(null);
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    if (this.saving()) return;
    const role = this.role();
    const army = this.army();
    this.formError.set(null);
    this.armyProblem.set(null);
    if (!this.ingameName().trim()) return this.formError.set('name');
    const missing = armyError(army);
    if (missing) return this.armyProblem.set(missing);
    this.saving.set(true);
    try {
      const first = !this.signup();
      const signup = await this.api.saveSignup({
        ingame_name: this.ingameName().trim(),
        role,
        kind: army.kind,
        primary: army.primary,
        secondary: army.secondary,
        primary_skills: army.skills.primary,
        secondary_skills: army.skills.secondary,
        note: this.note().trim(),
      });
      // the sign-up saved the in-game name on the player too: the header drops its red "!"
      if (this.auth.needsName()) this.auth.reload();
      this.store(signup);
      this.editing.set(null);
      this.saved.set(true);
      setTimeout(() => this.saved.set(false), 3000);
      if (first) {
        this.changed.emit();
        // like a new march: its equipment and armaments right away; the card's button gets the focus back
        afterNextRender(
          () => {
            const button = this.host.nativeElement.querySelector<HTMLElement>('.kvk-card .march__build');
            this.buildEditor().open(asMarch(signup), button);
          },
          { injector: this.injector },
        );
      }
    } catch {
      this.formError.set('failed');
    } finally {
      this.saving.set(false);
    }
  }

  /** a sign-up saved by the form or the build editor */
  protected store(signup: KvkSignup | March): void {
    const role = (signup as KvkSignup).role ?? this.role();
    this.signups.update((all) => ({ ...all, [role]: { ...(all[role] ?? {}), ...signup } as KvkSignup }));
  }

  /** the player's sign-up of a role */
  protected async withdraw(role: KvkRole): Promise<void> {
    try {
      await this.api.withdraw(role);
      this.confirmWithdraw.set(null);
      this.signups.update((all) => ({ ...all, [role]: null }));
      this.armies.update((all) => ({ ...all, [role]: armyDraft() }));
      this.notes.update((all) => ({ ...all, [role]: '' }));
      this.editing.set(null);
      this.changed.emit();
    } catch {
      this.formError.set('failed');
    }
  }
}

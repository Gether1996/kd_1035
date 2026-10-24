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
import {
  KVK_BUDGETS,
  KVK_KINDS,
  KVK_ONLINE,
  KVK_ROLES,
  KvkApi,
  KvkBudget,
  KvkOnline,
  KvkRole,
  KvkSignup,
  KvkState,
  March,
  asMarch,
  surveyMissing,
} from '../../core/kvk-api';
import { MarchChange, MarchCommander, MarchesApi, marchCommandersUrl } from '../../core/marches-api';
import { Icon } from '../../shared/icon';
import { MarchBuild } from '../../shared/march-build';
import { ArmyDraft, ArmyError, MarchFields, armyDraft, armyError } from '../../shared/march-fields';
import { BuildEditor } from '../players-marches/build-editor';
import { buildChange, draftOf } from './from-march';
import { surveyText } from './survey';

/** up to two sign-ups per role (Gether 22. 10. 2026): rally 1, rally 2, garrison 1, garrison 2 */
type Slot = KvkSignup['slot'];
type Key = `${KvkRole}-${Slot}`;
type PerKey<T> = Record<Key, T>;
const KEYS: Key[] = ['rally-1', 'rally-2', 'garrison-1', 'garrison-2'];
const keyOf = (role: KvkRole, slot: Slot): Key => `${role}-${slot}`;

const perKey = <T,>(make: (key: Key) => T): PerKey<T> =>
  Object.fromEntries(KEYS.map((key) => [key, make(key)])) as PerKey<T>;

/**
 * The player's KvK sign-ups on /kvk – filled in exactly like "Moje marche" (Gether 12. 10. 2026: "žiadne screenshoty
 * a všetko sa dá naklikať, presne ako moje marche"), plus a note. The in-game name, then a tab for rally and one for
 * garrison (a player may sign up for both). Without a sign-up: the form – troops, commanders with their skills, note –
 * and "Prihlásiť sa a naklikať výbavu" opens the build editor. With one: its card (equipment, armaments, bonuses) with
 * "Upraviť výbavu", the pencil for the form, the note and withdrawing. Only the reviewers and the superuser see it; it
 * stays for every KvK until the player or the superuser withdraws it.
 * The form also asks a short survey (Gether 20. 10. 2026): how much the player puts into the KvK (one) and when they are
 * online (any) – a rough guess; the second sign-up starts with the answers of the first. A sign-up from before the
 * survey asks for it on its card (and the header's red "!" leads here); one survey counts for all the sign-ups.
 * Up to two sign-ups per role (Gether 22. 10. 2026: "2x rally a 2x garrison"): under the role tabs "1. prihláška" and
 * "2. prihláška" (or "+ 2. prihláška" once the first is saved); withdrawing the first makes the second the first.
 * "Vyplniť z marchu" (24. 10. 2026) fills the form from one of the player's marches and copies its build on saving.
 */
@Component({
  selector: 'app-kvk-form',
  imports: [BuildEditor, Icon, MarchBuild, MarchFields, RouterLink],
  templateUrl: './kvk-form.html',
  styleUrls: ['./kvk.scss', './kvk-form.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KvkForm {
  readonly state = input.required<KvkState>();
  /** a sign-up was added or withdrawn – the page asks for the state again */
  readonly changed = output<void>();

  private readonly api = inject(KvkApi);
  private readonly marchesApi = inject(MarchesApi);
  private readonly auth = inject(Auth);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  protected readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.t().kvk);
  protected readonly roles = KVK_ROLES;
  protected readonly kinds = KVK_KINDS;
  protected readonly budgetChoices = KVK_BUDGETS;
  protected readonly onlineChoices = KVK_ONLINE;
  protected readonly surveyOf = (signup: KvkSignup) => surveyText(signup, this.t().survey);
  private readonly buildEditor = viewChild.required(BuildEditor);

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly commanderData = httpResource<MarchCommander[]>(() => (this.isBrowser ? marchCommandersUrl : undefined));
  protected readonly commanders = computed(() => (this.commanderData.hasValue() ? this.commanderData.value() : []));
  protected readonly portraits = computed(() => new Map(this.commanders().map((c) => [c.name, c.icon])));

  /** the player's sign-ups – the forms start from them */
  protected readonly signups = linkedSignal<PerKey<KvkSignup | null>>(() => {
    const all = this.state().signups;
    return perKey((key) => all.find((s) => keyOf(s.role, s.slot ?? 1) === key) ?? null);
  });
  protected readonly ingameName = linkedSignal(() => this.state().ingame_name);
  protected readonly notes = linkedSignal(() => perKey((key) => this.signups()[key]?.note ?? ''));
  protected readonly armies = linkedSignal(() => perKey((key) => armyDraft(this.signups()[key])));
  /** the survey of each form: its own answers, else those of another sign-up (the same player, the same KvK) */
  protected readonly budgets = linkedSignal(() => perKey((key) => this.surveyStart(key).budget));
  protected readonly onlines = linkedSignal(() => perKey((key) => this.surveyStart(key).online));
  /** the form of a sign-up is open (the pencil) */
  protected readonly editing = signal<Key | null>(null);

  /** the tab: rally, or garrison when the player signed up only for that */
  protected readonly role = linkedSignal<KvkRole>(() =>
    !this.state().signups.some((s) => s.role === 'rally') && this.state().signups.some((s) => s.role === 'garrison')
      ? 'garrison'
      : 'rally',
  );
  /** the first or the second sign-up of the role */
  protected readonly slot = linkedSignal<KvkRole, Slot>({ source: this.role, computation: () => 1 });
  protected readonly key = computed(() => keyOf(this.role(), this.slot()));
  protected readonly signup = computed(() => this.signups()[this.key()]);
  /** the role has its first sign-up – it may add a second one */
  protected readonly hasFirst = computed(() => !!this.signups()[keyOf(this.role(), 1)]);
  protected readonly hasSecond = computed(() => !!this.signups()[keyOf(this.role(), 2)]);
  protected readonly army = computed(() => this.armies()[this.key()]);
  protected readonly note = computed(() => this.notes()[this.key()]);
  protected readonly budget = computed(() => this.budgets()[this.key()]);
  /** one survey counts for all the sign-ups (Gether 20. 10. 2026): the shown one's, else another's; null = none yet */
  protected readonly survey = computed(() => {
    const all = this.signups();
    return [all[this.key()], ...KEYS.map((key) => all[key])].find((s) => s && !surveyMissing(s)) ?? null;
  });
  protected readonly online = computed(() => this.onlines()[this.key()]);
  /** the form shows without a sign-up and while the pencil is on */
  protected readonly formOpen = computed(() => !this.signup() || this.editing() === this.key());
  /** "Rally", "Garrison 2" – the heading of the form and the withdraw button */
  protected readonly label = computed(
    () => (this.role() === 'rally' ? 'Rally' : 'Garrison') + (this.slot() > 1 ? ` ${this.slot()}` : ''),
  );

  /** the player's marches for "Vyplniť z marchu" – asked once the form shows for the first time */
  private readonly wantMarches = linkedSignal<boolean, boolean>({
    source: () => this.formOpen() && this.state().approved,
    computation: (now, previous) => now || !!previous?.value,
  });
  private readonly marchData = this.marchesApi.list(() => this.wantMarches());
  /** none while loading or when the request failed – the select stays hidden */
  protected readonly marches = computed(() => (this.marchData.hasValue() ? (this.marchData.value().marches ?? []) : []));
  /** the march each form copies its build from on saving */
  protected readonly copies = signal(perKey<March | null>(() => null));
  protected readonly copy = computed(() => this.copies()[this.key()]);
  /** the march whose copy waits for the confirmation – it would overwrite a filled form */
  protected readonly confirmCopy = signal<March | null>(null);

  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly formError = signal<'name' | 'survey' | 'failed' | null>(null);
  protected readonly armyProblem = signal<ArmyError | null>(null);
  /** the sign-up whose withdraw waits for the confirmation */
  protected readonly confirmWithdraw = signal<Key | null>(null);

  protected readonly asMarch = asMarch;
  protected readonly built = hasBuild;

  /** the build editor saves into the sign-up it was opened for */
  protected readonly saveBuild = (march: March, change: MarchChange): Promise<March> => {
    const signup = march as Partial<KvkSignup>;
    return this.api.saveBuild(signup.role ?? this.role(), signup.slot ?? this.slot(), change).then(asMarch);
  };

  protected hasRole(role: KvkRole): boolean {
    return !!this.signups()[keyOf(role, 1)];
  }

  protected showRole(role: KvkRole): void {
    this.role.set(role);
    this.showSlot(1);
  }

  protected showSlot(slot: Slot): void {
    this.slot.set(slot);
    this.editing.set(null);
    this.formError.set(null);
    this.armyProblem.set(null);
    this.confirmWithdraw.set(null);
    this.confirmCopy.set(null);
  }

  /** "Infantry · Primary + Secondary" */
  protected marchLabel(march: March): string {
    const kind = march.kind ? `${this.i18n.t().marches.kinds[march.kind]} · ` : '';
    return kind + [march.primary, march.secondary].filter(Boolean).join(' + ');
  }

  /** a march picked in "Vyplniť z marchu": a filled form asks first (the second click, like withdrawing) */
  protected pickMarch(select: HTMLSelectElement): void {
    const march = this.marches().find((m) => String(m.id) === select.value) ?? null;
    select.value = String(this.copy()?.id ?? '');
    if (!march) {
      this.copies.update((all) => ({ ...all, [this.key()]: null }));
      return this.confirmCopy.set(null);
    }
    const army = this.army();
    if (army.kind || army.primary || army.secondary) return this.confirmCopy.set(march);
    this.copyMarch(march);
  }

  protected copyMarch(march: March): void {
    this.confirmCopy.set(null);
    this.setArmy(draftOf(march));
    this.copies.update((all) => ({ ...all, [this.key()]: march }));
  }

  protected setArmy(value: ArmyDraft): void {
    this.armies.update((all) => ({ ...all, [this.key()]: value }));
    this.armyProblem.set(null);
  }

  protected setNote(value: string): void {
    this.notes.update((all) => ({ ...all, [this.key()]: value }));
  }

  protected setBudget(value: KvkBudget): void {
    this.budgets.update((all) => ({ ...all, [this.key()]: value }));
    if (this.formError() === 'survey') this.formError.set(null);
  }

  protected toggleOnline(value: KvkOnline): void {
    this.onlines.update((all) => {
      const now = all[this.key()];
      return { ...all, [this.key()]: now.includes(value) ? now.filter((v) => v !== value) : [...now, value] };
    });
    if (this.formError() === 'survey') this.formError.set(null);
  }

  /** the answers a form starts with */
  private surveyStart(key: Key): { budget: KvkBudget | ''; online: KvkOnline[] } {
    // the saved sign-ups – a sign-up just sent gives its answers to the other tabs
    const signups = this.signups();
    const own = signups[key];
    const other = KEYS.map((k) => signups[k]).find((s) => s && !surveyMissing(s));
    const from = own && !surveyMissing(own) ? own : (other ?? own);
    return { budget: from?.budget ?? '', online: [...(from?.online ?? [])] };
  }

  /** the pencil: the form of the sign-up shown */
  protected edit(): void {
    this.editing.set(this.key());
  }

  /** "Zrušiť" in the form of a saved sign-up: back to its card, the changes dropped */
  protected cancel(): void {
    const key = this.key();
    const signup = this.signups()[key];
    this.armies.update((all) => ({ ...all, [key]: armyDraft(signup) }));
    this.notes.update((all) => ({ ...all, [key]: signup?.note ?? '' }));
    const start = this.surveyStart(key);
    this.budgets.update((all) => ({ ...all, [key]: start.budget }));
    this.onlines.update((all) => ({ ...all, [key]: start.online }));
    this.copies.update((all) => ({ ...all, [key]: null }));
    this.confirmCopy.set(null);
    this.editing.set(null);
    this.armyProblem.set(null);
    this.formError.set(null);
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    if (this.saving()) return;
    const role = this.role();
    const slot = this.slot();
    const army = this.army();
    const copy = this.copy();
    this.formError.set(null);
    this.confirmCopy.set(null);
    this.armyProblem.set(null);
    if (!this.ingameName().trim()) return this.formError.set('name');
    const missing = armyError(army);
    if (missing) return this.armyProblem.set(missing);
    const budget = this.budget();
    const online = KVK_ONLINE.filter((key) => this.online().includes(key));
    if (!budget || !online.length) return this.formError.set('survey');
    this.saving.set(true);
    try {
      const first = !this.signup();
      const signup = await this.api.saveSignup({
        ingame_name: this.ingameName().trim(),
        role,
        slot,
        kind: army.kind,
        primary: army.primary,
        secondary: army.secondary,
        primary_skills: army.skills.primary,
        secondary_skills: army.skills.secondary,
        note: this.note().trim(),
        budget,
        online,
      });
      // the sign-up saved the in-game name on the player too, and the survey: the header drops its red "!"
      if (this.auth.needsName() || this.auth.needsSurvey()) this.auth.reload();
      this.store(signup);
      // "Vyplniť z marchu": the march's build and armaments, checked by the server like the build editor's
      const change = copy && buildChange(copy);
      let copied = false;
      if (change) {
        try {
          this.store(await this.api.saveBuild(role, slot, change));
          copied = true;
        } catch {
          // the sign-up is saved – the build editor below lets the player click the build instead
        }
      }
      this.copies.update((all) => ({ ...all, [keyOf(role, slot)]: null }));
      this.editing.set(null);
      this.saved.set(true);
      setTimeout(() => this.saved.set(false), 3000);
      if (first) this.changed.emit();
      if ((first || change) && !copied) {
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
    const saved = signup as KvkSignup;
    const key = keyOf(saved.role ?? this.role(), saved.slot ?? this.slot());
    this.signups.update((all) => {
      const next = { ...all, [key]: { ...(all[key] ?? {}), ...signup } as KvkSignup };
      // the form's survey goes to the other sign-ups too, as on the server
      if (saved.budget && saved.online?.length) {
        for (const other of KEYS) {
          if (other !== key && next[other]) next[other] = { ...next[other]!, budget: saved.budget, online: saved.online };
        }
      }
      return next;
    });
  }

  /** the player's sign-up shown; the second one of the role moves up when the first goes, as on the server */
  protected async withdraw(): Promise<void> {
    const role = this.role();
    const slot = this.slot();
    try {
      await this.api.withdraw(role, slot);
      this.confirmWithdraw.set(null);
      const [first, second] = [keyOf(role, 1), keyOf(role, 2)];
      if (slot === 1) {
        this.signups.update((all) => ({ ...all, [first]: all[second] && { ...all[second]!, slot: 1 }, [second]: null }));
        this.armies.update((all) => ({ ...all, [first]: all[second], [second]: armyDraft() }));
        this.notes.update((all) => ({ ...all, [first]: all[second], [second]: '' }));
      } else {
        this.signups.update((all) => ({ ...all, [second]: null }));
        this.armies.update((all) => ({ ...all, [second]: armyDraft() }));
        this.notes.update((all) => ({ ...all, [second]: '' }));
      }
      this.slot.set(1);
      this.editing.set(null);
      this.copies.set(perKey(() => null));
      this.changed.emit();
    } catch {
      this.formError.set('failed');
    }
  }
}

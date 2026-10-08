import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { KingdomApi } from '../../../core/api';
import {
  GOVERNOR_ID,
  GOVERNOR_NAME_MAX,
  Governor,
  GovernorError,
  GovernorKind,
  GovernorsApi,
  MAX_GOVERNORS,
} from '../../../core/governors-api';
import { I18n } from '../../../core/i18n/i18n';
import { Icon } from '../../../shared/icon';

/** /ucet – the player's Governor IDs: list with status, two-step removal and the registration form. */
@Component({
  selector: 'app-governors',
  imports: [Icon],
  templateUrl: './governors.html',
  styleUrl: './governors.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Governors {
  protected readonly api = inject(GovernorsApi);
  protected readonly kingdom = inject(KingdomApi);
  protected readonly t = inject(I18n).t;
  protected readonly max = MAX_GOVERNORS;
  protected readonly nameMax = GOVERNOR_NAME_MAX;
  protected readonly kinds: GovernorKind[] = ['main', 'farm'];

  private readonly idInput = viewChild.required<ElementRef<HTMLInputElement>>('idInput');
  private readonly nameInput = viewChild.required<ElementRef<HTMLInputElement>>('nameInput');
  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');

  // ---------------------------------------------------------------- form
  protected readonly governorId = signal('');
  protected readonly name = signal('');
  protected readonly kind = signal<GovernorKind>('main');
  /** the kingdom has one main alliance – preselected once the list arrives; null = other or none */
  protected readonly alliance = linkedSignal<number | null>(() => this.kingdom.alliances()[0]?.id ?? null);
  /** field errors show after leaving the field or after the first submit */
  protected readonly touched = signal({ id: false, name: false });
  protected readonly serverError = signal<GovernorError | null>(null);
  protected readonly busy = signal(false);
  protected readonly added = signal(false);

  protected readonly idError = computed(() => {
    const errors = this.t().account.governors.errors;
    const server = this.serverError();
    if (server === 'invalid_id' || server === 'taken') return errors[server];
    if (!this.touched().id) return null;
    const value = this.governorId().trim();
    return !value ? errors.required : GOVERNOR_ID.test(value) ? null : errors.invalid_id;
  });

  protected readonly nameError = computed(() => {
    const errors = this.t().account.governors.errors;
    if (this.serverError() === 'invalid_name') return errors.invalid_name;
    if (!this.touched().name) return null;
    return this.name().trim() ? null : errors.required;
  });

  /** errors that belong to no single field */
  protected readonly formError = computed(() => {
    const server = this.serverError();
    if (!server || server === 'invalid_id' || server === 'taken' || server === 'invalid_name') return null;
    return this.t().account.governors.errors[server];
  });

  // ---------------------------------------------------------------- list
  /** first click on "remove" asks, the second one removes */
  protected readonly confirming = signal<number | null>(null);
  protected readonly removing = signal<number | null>(null);
  protected readonly removeFailed = signal<number | null>(null);

  protected setId(value: string): void {
    this.governorId.set(value);
    this.clearServerError('invalid_id', 'taken');
  }

  protected setName(value: string): void {
    this.name.set(value);
    this.clearServerError('invalid_name');
  }

  protected touch(field: 'id' | 'name'): void {
    // an empty field left with Tab is not an error yet
    const value = field === 'id' ? this.governorId() : this.name();
    if (value.trim()) this.touched.update((t) => ({ ...t, [field]: true }));
  }

  protected pickAlliance(value: string): void {
    this.alliance.set(value ? Number(value) : null);
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy()) return;
    this.touched.set({ id: true, name: true });
    this.serverError.set(null);
    this.added.set(false);
    if (this.idError()) return this.idInput().nativeElement.focus();
    if (this.nameError()) return this.nameInput().nativeElement.focus();

    this.busy.set(true);
    try {
      await this.api.add({
        governor_id: this.governorId().trim(),
        name: this.name().trim(),
        kind: this.kind(),
        alliance: this.alliance(),
      });
      this.governorId.set('');
      this.name.set('');
      this.kind.set('main');
      this.touched.set({ id: false, name: false });
      this.added.set(true);
    } catch (error) {
      this.serverError.set(error as GovernorError);
      if (this.idError()) this.idInput().nativeElement.focus();
      else if (this.nameError()) this.nameInput().nativeElement.focus();
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(governor: Governor): Promise<void> {
    if (this.confirming() !== governor.id) {
      this.confirming.set(governor.id);
      this.removeFailed.set(null);
      return;
    }
    this.removing.set(governor.id);
    try {
      await this.api.remove(governor.id);
      this.confirming.set(null);
      this.added.set(false);
      // the row with the focused button is gone – continue from the section heading
      this.heading().nativeElement.focus();
    } catch {
      this.removeFailed.set(governor.id);
    } finally {
      this.removing.set(null);
    }
  }

  private clearServerError(...codes: GovernorError[]): void {
    const server = this.serverError();
    if (server && codes.includes(server)) this.serverError.set(null);
  }
}

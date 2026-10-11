import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n } from '../../core/i18n/i18n';
import {
  IMAGE_KINDS,
  ImageKind,
  KvkApi,
  KvkImage,
  KvkRound,
  KvkSignup,
  KvkState,
  MAX_PER_KIND,
  UploadError,
} from '../../core/kvk-api';
import { Icon } from '../../shared/icon';

/**
 * The player's KvK sign-up on /kvk: in-game name, rally / garrison, commander pair, note – then the screenshots of
 * the VIP level, equipment, armaments and the commander pair (only the reviewers and the superuser see them).
 */
@Component({
  selector: 'app-kvk-form',
  imports: [Icon, RouterLink],
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
  protected readonly kinds = IMAGE_KINDS;
  protected readonly maxPerKind = MAX_PER_KIND;

  /** the sign-up of the open round – the form starts from it (an older round's sign-up does not fill it) */
  protected readonly signup = linkedSignal<KvkSignup | null>(() => this.state().signup);
  /** sign-ups of closed rounds: read only, the screenshots and the whole sign-up may be deleted */
  protected readonly older = linkedSignal(() => this.state().older);
  protected readonly ingameName = linkedSignal(() => this.state().ingame_name);
  protected readonly rally = linkedSignal(() => this.state().signup?.rally ?? false);
  protected readonly garrison = linkedSignal(() => this.state().signup?.garrison ?? false);
  protected readonly commanders = linkedSignal(() => this.state().signup?.commanders ?? '');
  protected readonly note = linkedSignal(() => this.state().signup?.note ?? '');

  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly formError = signal<'name' | 'role' | 'failed' | null>(null);
  protected readonly uploading = signal<ReadonlySet<ImageKind>>(new Set());
  protected readonly uploadError = signal<{ kind: ImageKind; error: UploadError } | null>(null);
  /** the sign-up whose withdraw waits for the confirmation: 'open' or an older round's id */
  protected readonly confirmWithdraw = signal<'open' | number | null>(null);

  protected readonly title = computed(() => {
    const round = this.state().round;
    return round ? this.roundTitle(round) : '';
  });
  protected readonly missing = computed(() => {
    const images = this.signup()?.images ?? [];
    return IMAGE_KINDS.filter((kind) => !images.some((image) => image.kind === kind));
  });

  protected imagesOf(kind: ImageKind): KvkImage[] {
    return (this.signup()?.images ?? []).filter((image) => image.kind === kind);
  }

  protected roundTitle(round: KvkRound): string {
    return (this.i18n.lang() === 'cs' && round.title_cs) || round.title_sk;
  }

  /** the screenshots of a sign-up in the order of the kinds */
  protected ordered(signup: KvkSignup): KvkImage[] {
    return IMAGE_KINDS.flatMap((kind) => signup.images.filter((image) => image.kind === kind));
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    if (this.saving()) return;
    if (!this.ingameName().trim()) return this.formError.set('name');
    if (!this.rally() && !this.garrison()) return this.formError.set('role');
    this.formError.set(null);
    this.saving.set(true);
    try {
      const first = !this.signup();
      this.signup.set(
        await this.api.saveSignup({
          ingame_name: this.ingameName().trim(),
          rally: this.rally(),
          garrison: this.garrison(),
          commanders: this.commanders().trim(),
          note: this.note().trim(),
        }),
      );
      this.saved.set(true);
      setTimeout(() => this.saved.set(false), 3000);
      if (first) this.changed.emit();
    } catch {
      this.formError.set('failed');
    } finally {
      this.saving.set(false);
    }
  }

  protected async upload(kind: ImageKind, input: HTMLInputElement): Promise<void> {
    const files = Array.from(input.files ?? []).slice(0, MAX_PER_KIND - this.imagesOf(kind).length);
    input.value = '';
    if (!files.length) return;
    this.uploadError.set(null);
    this.uploading.update((set) => new Set(set).add(kind));
    for (const file of files) {
      const result = await this.api.upload(kind, file);
      if (typeof result === 'string') {
        this.uploadError.set({ kind, error: result });
        break;
      }
      this.signup.update((s) => (s ? { ...s, images: [...s.images, result] } : s));
    }
    this.uploading.update((set) => {
      const next = new Set(set);
      next.delete(kind);
      return next;
    });
  }

  protected async remove(image: KvkImage): Promise<void> {
    try {
      await this.api.removeImage(image.id);
      const without = (s: KvkSignup) => ({ ...s, images: s.images.filter((i) => i.id !== image.id) });
      this.signup.update((s) => (s ? without(s) : s));
      this.older.update((list) => list.map((o) => ({ ...o, signup: without(o.signup) })));
    } catch {
      this.uploadError.set({ kind: image.kind, error: 'failed' });
    }
  }

  protected async withdraw(round?: number): Promise<void> {
    try {
      await this.api.withdraw(round);
      this.confirmWithdraw.set(null);
      if (round) this.older.update((list) => list.filter((o) => o.round.id !== round));
      else this.signup.set(null);
      this.changed.emit();
    } catch {
      this.formError.set('failed');
    }
  }
}

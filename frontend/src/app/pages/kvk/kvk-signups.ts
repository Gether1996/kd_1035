import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { I18n } from '../../core/i18n/i18n';
import { IMAGE_KINDS, KvkApi, KvkImage, KvkRound, KvkSignup, marchIcon } from '../../core/kvk-api';
import { Icon } from '../../shared/icon';

type Role = 'all' | 'rally' | 'garrison';

/**
 * "Prihlášky" on /kvk for the reviewers (R4) and the superuser: every sign-up of a round with the player, role,
 * commander pair, note and the screenshots by kind; a click opens the screenshot in a dialog.
 */
@Component({
  selector: 'app-kvk-signups',
  imports: [Icon],
  templateUrl: './kvk-signups.html',
  styleUrl: './kvk.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KvkSignups {
  readonly rounds = input.required<KvkRound[]>();

  private readonly api = inject(KvkApi);
  protected readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.t().kvk);
  protected readonly kinds = IMAGE_KINDS;
  protected readonly icon = marchIcon;

  /** the open round, else the newest */
  protected readonly roundId = linkedSignal<KvkRound[], number | null>({
    source: () => this.rounds(),
    computation: (rounds, previous) =>
      (previous && rounds.some((r) => r.id === previous.value) ? previous.value : null) ??
      (rounds.find((r) => r.is_open) ?? rounds[0])?.id ??
      null,
  });
  protected readonly data = this.api.signups(() => this.roundId());
  protected readonly role = signal<Role>('all');
  protected readonly all = computed(() => (this.data.hasValue() ? this.data.value().signups : []));
  protected readonly shown = computed(() => {
    const role = this.role();
    return this.all().filter((s) => role === 'all' || s[role]);
  });
  protected readonly counts = computed(() => ({
    all: this.all().length,
    rally: this.all().filter((s) => s.rally).length,
    garrison: this.all().filter((s) => s.garrison).length,
  }));

  protected readonly viewing = signal<{ signup: KvkSignup; image: KvkImage } | null>(null);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('viewer');
  private opener: HTMLElement | null = null;

  protected roundTitle(round: KvkRound): string {
    return (this.i18n.lang() === 'cs' && round.title_cs) || round.title_sk;
  }

  protected imagesOf(signup: KvkSignup, kind: string): KvkImage[] {
    return signup.images.filter((image) => image.kind === kind);
  }

  protected name(signup: KvkSignup): string {
    return signup.player?.ingame_name || signup.player?.name || '';
  }

  protected date(iso: string): string {
    return new Intl.DateTimeFormat(this.i18n.locale(), {
      day: 'numeric',
      month: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  }

  protected open(signup: KvkSignup, image: KvkImage, event: Event): void {
    this.opener = event.currentTarget as HTMLElement;
    this.viewing.set({ signup, image });
    this.dialog()?.nativeElement.showModal();
  }

  /** ← → between the player's screenshots */
  protected step(by: number): void {
    const current = this.viewing();
    if (!current) return;
    const images = IMAGE_KINDS.flatMap((kind) => this.imagesOf(current.signup, kind));
    const index = images.findIndex((i) => i.id === current.image.id);
    this.viewing.set({ signup: current.signup, image: images[(index + by + images.length) % images.length] });
  }

  protected key(event: KeyboardEvent): void {
    if (event.key === 'ArrowRight') this.step(1);
    if (event.key === 'ArrowLeft') this.step(-1);
  }

  protected close(): void {
    this.dialog()?.nativeElement.close();
  }

  protected closed(): void {
    this.viewing.set(null);
    this.opener?.focus();
  }
}

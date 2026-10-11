import { isPlatformBrowser } from '@angular/common';
import { HttpResourceRef, httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  PLATFORM_ID,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { I18n } from '../../core/i18n/i18n';
import { IMAGE_KINDS, KVK_KINDS, KvkApi, KvkImage, KvkSignup, MARCH_STATS, March, MarchKind, marchIcon } from '../../core/kvk-api';
import { MarchCommander, marchCommandersUrl } from '../../core/marches-api';
import { Icon } from '../../shared/icon';
import { MarchRow } from '../../shared/march-row';

type Role = 'all' | 'rally' | 'garrison';

/**
 * "Prihlášky" on /kvk for the reviewers (R4) and the superuser: every sign-up with the player, role, the army as a
 * march row and the note; a click opens the screenshot in a dialog. The superuser may withdraw a sign-up.
 */
@Component({
  selector: 'app-kvk-signups',
  imports: [Icon, MarchRow],
  templateUrl: './kvk-signups.html',
  styleUrl: './kvk.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KvkSignups {
  /** every sign-up – loaded by the page, which asks again after a change */
  readonly data = input.required<HttpResourceRef<{ signups: KvkSignup[] } | undefined>>();
  /** the superuser may withdraw a sign-up */
  readonly superuser = input(false);
  readonly changed = output<void>();

  private readonly api = inject(KvkApi);
  protected readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.t().kvk);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  /** the portraits of the players' marches */
  private readonly commanderData = httpResource<MarchCommander[]>(() => (this.isBrowser ? marchCommandersUrl : undefined));
  protected readonly portraits = computed(
    () => new Map((this.commanderData.hasValue() ? this.commanderData.value() : []).map((c) => [c.name, c.icon])),
  );

  protected readonly role = signal<Role>('all');
  /** the troops filter (Gether 11. 10. 2026), combined with the role */
  protected readonly troops = signal<MarchKind | 'all'>('all');
  protected readonly troopKinds = KVK_KINDS;
  protected readonly icon = marchIcon;
  protected readonly all = computed(() => this.data().value()?.signups ?? []);
  /** the sign-up whose withdraw waits for the second click */
  protected readonly armed = signal<number | null>(null);
  protected readonly failed = signal(false);
  /** the sign-ups of the chosen role – the troops counts are of these */
  private readonly ofRole = computed(() => {
    const role = this.role();
    return this.all().filter((s) => role === 'all' || s.role === role);
  });
  protected readonly shown = computed(() => {
    const troops = this.troops();
    return this.ofRole().filter((s) => troops === 'all' || s.kind === troops);
  });
  /** each sign-up as a row like a march (no type, no number) */
  protected readonly armies = computed(
    () =>
      new Map(
        this.all().map((s): [number, March] => {
          const stats = Object.fromEntries(MARCH_STATS.map((stat) => [stat, s[stat] ?? null]));
          return [s.id, { id: s.id, position: 0, kind: s.kind, primary: s.primary, secondary: s.secondary, images: s.images, ...stats }];
        }),
      ),
  );
  protected readonly counts = computed(() => ({
    all: this.all().length,
    rally: this.all().filter((s) => s.role === 'rally').length,
    garrison: this.all().filter((s) => s.role === 'garrison').length,
  }));
  protected readonly troopCounts = computed(() => {
    const counts: Record<string, number> = { all: this.ofRole().length };
    for (const kind of KVK_KINDS) counts[kind] = this.ofRole().filter((s) => s.kind === kind).length;
    return counts;
  });

  protected readonly viewing = signal<{ signup: KvkSignup; image: KvkImage } | null>(null);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('viewer');
  private opener: HTMLElement | null = null;

  protected async remove(signup: KvkSignup): Promise<void> {
    if (this.armed() !== signup.id) {
      this.armed.set(signup.id);
      return;
    }
    this.armed.set(null);
    this.failed.set(false);
    try {
      await this.api.deleteSignup(signup.id);
      this.changed.emit();
    } catch {
      this.failed.set(true);
    }
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

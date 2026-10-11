import { isPlatformBrowser } from '@angular/common';
import { httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  PLATFORM_ID,
  computed,
  inject,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { I18n } from '../../core/i18n/i18n';
import { MARCH_KINDS, MAX_PER_KIND, March, MarchImage, MarchKind, UploadError, marchIcon } from '../../core/kvk-api';
import { MarchChange, MarchesApi } from '../../core/marches-api';
import { Icon } from '../../shared/icon';
import { fold } from '../../shared/search';
import { CommanderRef } from '../guides/commander-finder';
import { shownCommander } from '../guides/hidden-commanders';

type Slot = 'primary' | 'secondary';
const IMAGE_KINDS: MarchImage['kind'][] = ['equipment', 'armaments'];

/**
 * "Moji commanderi a výbava" on /ucet (Gether 11. 10. 2026): up to 7 marches added one by one with "+", each with a
 * type icon, a commander pair picked from the portraits of our guides, and screenshots of equipment and armaments.
 * Seen by the player, the reviewers (R4) and the superuser – next to the KvK sign-up.
 */
@Component({
  selector: 'app-marches',
  imports: [Icon],
  templateUrl: './marches.html',
  styleUrls: ['../kvk/kvk.scss', './marches.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Marches {
  private readonly api = inject(MarchesApi);
  protected readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.t().marches);
  protected readonly kinds = MARCH_KINDS;
  protected readonly imageKinds = IMAGE_KINDS;
  protected readonly maxPerKind = MAX_PER_KIND;
  protected readonly icon = marchIcon;

  private readonly data = this.api.list();
  protected readonly loaded = computed(() => this.data.hasValue());
  protected readonly failed = computed(() => !!this.data.error());
  protected readonly marches = linkedSignal<March[]>(() => (this.data.hasValue() ? this.data.value().marches : []));
  protected readonly max = computed(() => (this.data.hasValue() ? this.data.value().max : 7));

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  /** the commanders of our guides with their portraits (the same list as "Nájdi pár pre commandera") */
  private readonly commanderData = httpResource<CommanderRef[]>(() => (this.isBrowser ? '/api/commanders/' : undefined));
  /** the meta commanders to pick from (without gatherers and KvK1 / KvK2 commanders, hidden-commanders.ts) */
  private readonly allCommanders = computed(() => (this.commanderData.hasValue() ? this.commanderData.value() : []));
  protected readonly commanders = computed(() => this.allCommanders().filter((c) => shownCommander(c.name)));
  // every portrait – a march saved before a commander was hidden keeps its picture
  private readonly portraits = computed(() => new Map(this.allCommanders().map((c) => [c.name, c.icon])));

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly uploading = signal<ReadonlySet<string>>(new Set());
  protected readonly uploadError = signal<{ key: string; error: UploadError } | null>(null);
  protected readonly armed = signal<number | null>(null);

  // ---------------------------------------------------------------- commander picker
  protected readonly picking = signal<{ march: March; slot: Slot } | null>(null);
  protected readonly search = signal('');
  protected readonly shown = computed(() => {
    const query = fold(this.search());
    return query ? this.commanders().filter((c) => fold(c.name).includes(query)) : this.commanders();
  });
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('picker');
  private opener: HTMLElement | null = null;

  protected addLabel(): string {
    const ordinals = this.t().ordinals;
    return this.t().add.replace('{n}', ordinals[this.marches().length] ?? String(this.marches().length + 1));
  }

  protected portrait(name: string): string | undefined {
    return this.portraits().get(name);
  }

  protected imagesOf(march: March, kind: MarchImage['kind']): MarchImage[] {
    return march.images.filter((image) => image.kind === kind);
  }

  protected async add(): Promise<void> {
    if (this.busy() || this.marches().length >= this.max()) return;
    await this.run(async () => {
      const march = await this.api.add();
      this.marches.update((list) => [...list, march]);
    });
  }

  protected setKind(march: March, kind: MarchKind): Promise<void> {
    return this.change(march, { kind: march.kind === kind ? '' : kind });
  }

  protected openPicker(march: March, slot: Slot, event: Event): void {
    this.opener = event.currentTarget as HTMLElement;
    this.search.set('');
    this.picking.set({ march, slot });
    this.dialog()?.nativeElement.showModal();
  }

  protected async pick(name: string): Promise<void> {
    const picking = this.picking();
    this.closePicker();
    if (picking) await this.change(picking.march, { [picking.slot]: name });
  }

  protected closePicker(): void {
    this.dialog()?.nativeElement.close();
  }

  protected pickerClosed(): void {
    this.picking.set(null);
    this.opener?.focus();
  }

  protected async remove(march: March): Promise<void> {
    if (this.armed() !== march.id) {
      this.armed.set(march.id);
      return;
    }
    this.armed.set(null);
    await this.run(async () => {
      await this.api.remove(march.id);
      // the later marches move up on the server too
      this.marches.update((list) =>
        list.filter((m) => m.id !== march.id).map((m, i) => ({ ...m, position: i + 1 })),
      );
    });
  }

  protected async upload(march: March, kind: MarchImage['kind'], input: HTMLInputElement): Promise<void> {
    const key = `${march.id}-${kind}`;
    const files = Array.from(input.files ?? []).slice(0, MAX_PER_KIND - this.imagesOf(march, kind).length);
    input.value = '';
    if (!files.length) return;
    this.uploadError.set(null);
    this.uploading.update((set) => new Set(set).add(key));
    for (const file of files) {
      const result = await this.api.upload(march.id, kind, file);
      if (typeof result === 'string') {
        this.uploadError.set({ key, error: result });
        break;
      }
      this.replace(march.id, (m) => ({ ...m, images: [...m.images, result] }));
    }
    this.uploading.update((set) => {
      const next = new Set(set);
      next.delete(key);
      return next;
    });
  }

  protected async removeImage(march: March, image: MarchImage): Promise<void> {
    try {
      await this.api.removeImage(image.id);
      this.replace(march.id, (m) => ({ ...m, images: m.images.filter((i) => i.id !== image.id) }));
    } catch {
      this.uploadError.set({ key: `${march.id}-${image.kind}`, error: 'failed' });
    }
  }

  private async change(march: March, change: MarchChange): Promise<void> {
    await this.run(async () => {
      const saved = await this.api.update(march.id, change);
      this.replace(march.id, () => saved);
    });
  }

  private replace(id: number, update: (march: March) => March): void {
    this.marches.update((list) => list.map((m) => (m.id === id ? update(m) : m)));
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await action();
    } catch {
      this.error.set(this.t().failed);
    } finally {
      this.busy.set(false);
    }
  }
}

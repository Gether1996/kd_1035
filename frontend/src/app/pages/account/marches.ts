import { NgTemplateOutlet, isPlatformBrowser } from '@angular/common';
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
import { MARCH_KINDS, March, MarchImage, MarchKind, UploadError, marchIcon } from '../../core/kvk-api';
import { MarchesApi } from '../../core/marches-api';
import { Icon } from '../../shared/icon';
import { fold } from '../../shared/search';
import { CommanderRef } from '../guides/commander-finder';
import { shownCommander } from '../guides/hidden-commanders';

type Slot = 'primary' | 'secondary';
type ImageKind = MarchImage['kind'];
const IMAGE_KINDS: ImageKind[] = ['equipment', 'armaments'];

/** The march being edited: a new one (id null) or a saved one; nothing is sent before "Uložiť". */
interface Draft {
  id: number | null;
  kind: MarchKind | '';
  primary: string;
  secondary: string;
}

/**
 * "Moji commanderi a výbava" on /ucet (Gether 11. 10. 2026): up to 7 marches. A march is filled in (type icon,
 * commander pair from the portraits of our guides) and saved; only then the next one can be added and its screenshots
 * of equipment and armaments (one each, with an example how it should look) uploaded. Seen by the player, the
 * reviewers (R4) and the superuser – next to the KvK sign-up.
 */
@Component({
  selector: 'app-marches',
  imports: [Icon, NgTemplateOutlet],
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
  protected readonly icon = marchIcon;

  private readonly data = this.api.list();
  protected readonly loaded = computed(() => this.data.hasValue());
  protected readonly failed = computed(() => !!this.data.error());
  protected readonly marches = linkedSignal<March[]>(() => (this.data.hasValue() ? this.data.value().marches : []));
  protected readonly max = computed(() => (this.data.hasValue() ? this.data.value().max : 7));

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  /** the commanders of our guides with their portraits (the same list as "Nájdi pár pre commandera") */
  private readonly commanderData = httpResource<CommanderRef[]>(() => (this.isBrowser ? '/api/commanders/' : undefined));
  private readonly allCommanders = computed(() => (this.commanderData.hasValue() ? this.commanderData.value() : []));
  /** the meta commanders to pick from (hidden-commanders.ts) */
  protected readonly commanders = computed(() => this.allCommanders().filter((c) => shownCommander(c.name)));
  // every portrait – a march saved before a commander was hidden keeps its picture
  private readonly portraits = computed(() => new Map(this.allCommanders().map((c) => [c.name, c.icon])));

  protected readonly draft = signal<Draft | null>(null);
  protected readonly draftError = signal<'kind' | 'primary' | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly uploading = signal<ReadonlySet<string>>(new Set());
  protected readonly uploadError = signal<{ key: string; error: UploadError } | null>(null);
  protected readonly armed = signal<number | null>(null);
  /** a new march can be added once nothing is being edited */
  protected readonly canAdd = computed(() => !this.draft() && this.marches().length < this.max());

  // ---------------------------------------------------------------- commander picker
  protected readonly picking = signal<Slot | null>(null);
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

  /** the number of the march being edited */
  protected draftPosition(): number {
    const draft = this.draft();
    return (draft?.id && this.marches().find((m) => m.id === draft.id)?.position) || this.marches().length + 1;
  }

  protected portrait(name: string): string | undefined {
    return this.portraits().get(name);
  }

  protected imageOf(march: March, kind: ImageKind): MarchImage | undefined {
    return march.images.find((image) => image.kind === kind);
  }

  // ---------------------------------------------------------------- editing

  protected add(): void {
    if (!this.canAdd()) return;
    this.draft.set({ id: null, kind: '', primary: '', secondary: '' });
    this.draftError.set(null);
  }

  protected edit(march: March): void {
    if (this.draft()) return;
    this.draft.set({ id: march.id, kind: march.kind, primary: march.primary, secondary: march.secondary });
    this.draftError.set(null);
  }

  protected cancel(): void {
    this.draft.set(null);
    this.draftError.set(null);
  }

  protected setKind(kind: MarchKind): void {
    this.draft.update((d) => (d ? { ...d, kind: d.kind === kind ? '' : kind } : d));
    this.draftError.set(null);
  }

  protected async save(): Promise<void> {
    const draft = this.draft();
    if (!draft || this.busy()) return;
    if (!draft.kind) return this.draftError.set('kind');
    if (!draft.primary) return this.draftError.set('primary');
    const change = { kind: draft.kind, primary: draft.primary, secondary: draft.secondary };
    await this.run(async () => {
      if (draft.id === null) {
        const created = await this.api.add(change);
        this.marches.update((list) => [...list, created]);
      } else {
        const saved = await this.api.update(draft.id, change);
        this.replace(draft.id, () => saved);
      }
      this.draft.set(null);
    });
  }

  protected openPicker(slot: Slot, event: Event): void {
    this.opener = event.currentTarget as HTMLElement;
    this.search.set('');
    this.picking.set(slot);
    this.dialog()?.nativeElement.showModal();
  }

  protected pick(name: string): void {
    const slot = this.picking();
    if (slot) this.draft.update((d) => (d ? { ...d, [slot]: name } : d));
    this.draftError.set(null);
    this.closePicker();
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
      this.marches.update((list) => list.filter((m) => m.id !== march.id).map((m, i) => ({ ...m, position: i + 1 })));
    });
  }

  // ---------------------------------------------------------------- screenshots (one per kind)

  protected async upload(march: March, kind: ImageKind, input: HTMLInputElement): Promise<void> {
    const key = `${march.id}-${kind}`;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.imageOf(march, kind)) return;
    this.uploadError.set(null);
    this.uploading.update((set) => new Set(set).add(key));
    const result = await this.api.upload(march.id, kind, file);
    if (typeof result === 'string') this.uploadError.set({ key, error: result });
    else this.replace(march.id, (m) => ({ ...m, images: [...m.images, result] }));
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

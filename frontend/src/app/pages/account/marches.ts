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

/** A screenshot chosen in the editor, not uploaded yet: the file and its local preview (object URL). */
interface Chosen {
  file: File;
  preview: string;
}

/** The march being edited: a new one (id null) or a saved one; nothing is sent before "Uložiť". Each kind of
 * screenshot is either kept (already on the server) or newly chosen – one of the two is required. */
interface Draft {
  id: number | null;
  kind: MarchKind | '';
  primary: string;
  secondary: string;
  keep: Partial<Record<ImageKind, MarchImage>>;
  chosen: Partial<Record<ImageKind, Chosen>>;
  /** saved screenshots the player removed – deleted on "Uložiť" */
  removed: MarchImage[];
}

type DraftError = 'kind' | 'primary' | ImageKind;

/**
 * "Moji commanderi a výbava" on /ucet (Gether 11. 10. 2026): up to 7 marches. A march is filled in (type icon,
 * commander pair from the portraits of our guides, one screenshot of the equipment and one of the armaments – both
 * required, with an example how they should look) and saved; only then the next one can be added. Seen by the player, the
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
  protected readonly draftError = signal<DraftError | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly uploadError = signal<{ kind: ImageKind; error: UploadError } | null>(null);
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

  // ---------------------------------------------------------------- example screenshot (dialog)
  protected readonly example = signal<ImageKind | null>(null);
  private readonly exampleDialog = viewChild<ElementRef<HTMLDialogElement>>('exampleDialog');

  protected showExample(kind: ImageKind, event: Event): void {
    this.opener = event.currentTarget as HTMLElement;
    this.example.set(kind);
    this.exampleDialog()?.nativeElement.showModal();
  }

  protected closeExample(): void {
    this.exampleDialog()?.nativeElement.close();
  }

  protected exampleClosed(): void {
    this.example.set(null);
    this.opener?.focus();
  }

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
    this.draft.set({ id: null, kind: '', primary: '', secondary: '', keep: {}, chosen: {}, removed: [] });
    this.draftError.set(null);
    this.uploadError.set(null);
  }

  protected edit(march: March): void {
    if (this.draft()) return;
    const keep: Draft['keep'] = {};
    for (const kind of IMAGE_KINDS) keep[kind] = this.imageOf(march, kind);
    this.draft.set({ id: march.id, kind: march.kind, primary: march.primary, secondary: march.secondary, keep, chosen: {}, removed: [] });
    this.draftError.set(null);
    this.uploadError.set(null);
  }

  protected cancel(): void {
    this.release(this.draft());
    this.draft.set(null);
    this.draftError.set(null);
    this.uploadError.set(null);
  }

  protected setKind(kind: MarchKind): void {
    this.draft.update((d) => (d ? { ...d, kind: d.kind === kind ? '' : kind } : d));
    this.draftError.set(null);
  }

  /** the screenshot shown in the editor for a kind: newly chosen, or the saved one */
  protected shotOf(kind: ImageKind): string | null {
    const draft = this.draft();
    return draft?.chosen[kind]?.preview ?? draft?.keep[kind]?.thumb ?? null;
  }

  protected choose(kind: ImageKind, input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.draft.update((d) => {
      if (!d) return d;
      const old = d.chosen[kind];
      if (old) URL.revokeObjectURL(old.preview);
      const removed = d.keep[kind] ? [...d.removed, d.keep[kind]!] : d.removed;
      return { ...d, keep: { ...d.keep, [kind]: undefined }, removed, chosen: { ...d.chosen, [kind]: { file, preview: URL.createObjectURL(file) } } };
    });
    this.draftError.set(null);
    this.uploadError.set(null);
  }

  protected unchoose(kind: ImageKind): void {
    this.draft.update((d) => {
      if (!d) return d;
      const old = d.chosen[kind];
      if (old) URL.revokeObjectURL(old.preview);
      const removed = d.keep[kind] ? [...d.removed, d.keep[kind]!] : d.removed;
      return { ...d, keep: { ...d.keep, [kind]: undefined }, removed, chosen: { ...d.chosen, [kind]: undefined } };
    });
  }

  protected async save(): Promise<void> {
    const draft = this.draft();
    if (!draft || this.busy()) return;
    if (!draft.kind) return this.draftError.set('kind');
    if (!draft.primary) return this.draftError.set('primary');
    const missing = IMAGE_KINDS.find((kind) => !draft.keep[kind] && !draft.chosen[kind]);
    if (missing) return this.draftError.set(missing);
    const change = { kind: draft.kind, primary: draft.primary, secondary: draft.secondary };
    await this.run(async () => {
      let march = draft.id === null ? await this.api.add(change) : await this.api.update(draft.id, change);
      for (const image of draft.removed) await this.api.removeImage(image.id);
      march = { ...march, images: march.images.filter((i) => !draft.removed.some((r) => r.id === i.id)) };
      // the march exists now: a failed upload keeps the editor open on it, the player only picks that file again
      let current: Draft = { ...draft, id: march.id, removed: [] };
      for (const kind of IMAGE_KINDS) {
        const chosen = current.chosen[kind];
        if (!chosen) continue;
        const result = await this.api.upload(march.id, kind, chosen.file);
        if (typeof result === 'string') {
          this.uploadError.set({ kind, error: result });
          break;
        }
        URL.revokeObjectURL(chosen.preview);
        march = { ...march, images: [...march.images, result] };
        current = { ...current, keep: { ...current.keep, [kind]: result }, chosen: { ...current.chosen, [kind]: undefined } };
      }
      this.store(march);
      this.draft.set(this.uploadError() ? current : null);
    });
  }

  /** a new or changed march into the list */
  private store(march: March): void {
    this.marches.update((list) =>
      list.some((m) => m.id === march.id) ? list.map((m) => (m.id === march.id ? march : m)) : [...list, march],
    );
  }

  private release(draft: Draft | null): void {
    for (const chosen of Object.values(draft?.chosen ?? {})) if (chosen) URL.revokeObjectURL(chosen.preview);
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

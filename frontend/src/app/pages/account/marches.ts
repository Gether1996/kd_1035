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
import {
  ARMAMENT_STATS,
  INSCRIPTIONS,
  MARCH_KINDS,
  MARCH_STATS,
  March,
  MarchImage,
  MarchKind,
  MarchStat,
  STAT_MAX,
  UploadError,
  marchIcon,
} from '../../core/kvk-api';
import { MarchesApi } from '../../core/marches-api';
import { Icon } from '../../shared/icon';
import { MarchRow, statLabel } from '../../shared/march-row';
import { fold } from '../../shared/search';
import { MarchCommander, marchCommandersUrl } from '../../core/marches-api';

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
  /** armament bonuses and inscriptions, null = empty field */
  stats: Record<MarchStat, number | null>;
  keep: Partial<Record<ImageKind, MarchImage>>;
  chosen: Partial<Record<ImageKind, Chosen>>;
  /** saved screenshots the player removed – deleted on "Uložiť" */
  removed: MarchImage[];
}

type DraftError = 'kind' | 'primary' | ImageKind;

const noStats = (): Record<MarchStat, number | null> =>
  Object.fromEntries(MARCH_STATS.map((stat) => [stat, null])) as Record<MarchStat, number | null>;

/**
 * "Moji commanderi a výbava" on /marche?tab=moje (Gether 11. 10. 2026): up to 7 marches, each a compact row
 * (MarchRow). A march is filled in (type icon, commander pair from portraits, one screenshot of the equipment and one of
 * the armaments – both required, with an example how they should look – and optionally the armament bonuses of its troop
 * type and the inscriptions) and saved; only then the next one can be added. Seen by the player, the reviewers (R4) and
 * the superuser – and every signed-in player when the player makes them public.
 */
@Component({
  selector: 'app-marches',
  imports: [Icon, MarchRow, NgTemplateOutlet],
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
  protected readonly slots: Slot[] = ['primary', 'secondary'];
  protected readonly armamentStats = ARMAMENT_STATS;
  protected readonly inscriptionKinds = INSCRIPTIONS;
  protected readonly icon = marchIcon;

  private readonly data = this.api.list();
  protected readonly loaded = computed(() => this.data.hasValue());
  protected readonly failed = computed(() => !!this.data.error());
  protected readonly marches = linkedSignal<March[]>(() => (this.data.hasValue() ? this.data.value().marches : []));
  protected readonly max = computed(() => (this.data.hasValue() ? this.data.value().max : 7));
  /** who sees the marches: every signed-in player (true) or only R4 and the superuser */
  protected readonly isPublic = linkedSignal(() => (this.data.hasValue() ? this.data.value().public : false));
  protected readonly visibilityFailed = signal(false);

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  /** every commander a march may name with its portrait (backend/guides/roster.py) */
  private readonly commanderData = httpResource<MarchCommander[]>(() => (this.isBrowser ? marchCommandersUrl : undefined));
  private readonly allCommanders = computed(() => (this.commanderData.hasValue() ? this.commanderData.value() : []));
  /** the commanders to pick from – no golden keys, gatherers, epic or elite ones (Gether 11. 10. 2026) */
  protected readonly commanders = computed(() => this.allCommanders().filter((c) => c.pick));
  // every portrait – a march saved before a commander was left out keeps its picture
  protected readonly portraits = computed(() => new Map(this.allCommanders().map((c) => [c.name, c.icon])));

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

  protected async setPublic(value: boolean): Promise<void> {
    if (value === this.isPublic()) return;
    const before = this.isPublic();
    this.isPublic.set(value);
    this.visibilityFailed.set(false);
    try {
      await this.api.setPublic(value);
    } catch {
      this.isPublic.set(before);
      this.visibilityFailed.set(true);
    }
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

  private imageOf(march: March, kind: ImageKind): MarchImage | undefined {
    return march.images.find((image) => image.kind === kind);
  }

  // ---------------------------------------------------------------- editing

  protected add(): void {
    if (!this.canAdd()) return;
    this.draft.set({ id: null, kind: '', primary: '', secondary: '', stats: noStats(), keep: {}, chosen: {}, removed: [] });
    this.draftError.set(null);
    this.uploadError.set(null);
  }

  protected edit(march: March): void {
    if (this.draft()) return;
    const keep: Draft['keep'] = {};
    for (const kind of IMAGE_KINDS) keep[kind] = this.imageOf(march, kind);
    const stats = noStats();
    for (const stat of MARCH_STATS) stats[stat] = march[stat] ?? null;
    this.draft.set({ id: march.id, kind: march.kind, primary: march.primary, secondary: march.secondary, stats, keep, chosen: {}, removed: [] });
    this.draftError.set(null);
    this.uploadError.set(null);
  }

  protected cancel(): void {
    this.armed.set(null);
    this.release(this.draft());
    this.draft.set(null);
    this.draftError.set(null);
    this.uploadError.set(null);
  }

  protected setKind(kind: MarchKind): void {
    this.draft.update((d) => (d ? { ...d, kind: d.kind === kind ? '' : kind } : d));
    this.draftError.set(null);
  }

  protected statLabel(kind: MarchKind | '', stat: (typeof ARMAMENT_STATS)[number]): string {
    return statLabel(this.t(), kind, stat);
  }

  /** whole numbers of at most two digits; anything else typed is dropped at once (no decimals – rounded up) */
  protected setStat(stat: MarchStat, event: Event): void {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '').slice(0, 2);
    if (input.value !== digits) input.value = digits;
    const value = digits === '' ? null : Math.min(Number(digits), STAT_MAX);
    this.draft.update((d) => (d ? { ...d, stats: { ...d.stats, [stat]: value } } : d));
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
    const change = { kind: draft.kind, primary: draft.primary, secondary: draft.secondary, ...draft.stats };
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

  /** "Odstrániť" in the editor of a saved march; the second click removes it with its screenshots */
  protected async removeDraft(): Promise<void> {
    const draft = this.draft();
    if (draft?.id == null || this.busy()) return;
    const id = draft.id;
    if (this.armed() !== id) {
      this.armed.set(id);
      return;
    }
    this.armed.set(null);
    await this.run(async () => {
      await this.api.remove(id);
      this.release(draft);
      this.draft.set(null);
      // the later marches move up on the server too
      this.marches.update((list) => list.filter((m) => m.id !== id).map((m, i) => ({ ...m, position: i + 1 })));
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

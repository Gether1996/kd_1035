import { NgTemplateOutlet, isPlatformBrowser } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, computed, inject, linkedSignal, signal } from '@angular/core';
import { I18n } from '../../core/i18n/i18n';
import { March, UploadError } from '../../core/kvk-api';
import { MarchCommander, MarchesApi, marchCommandersUrl } from '../../core/marches-api';
import { Icon } from '../../shared/icon';
import { ArmyDraft, ArmyError, MARCH_SHOTS, MarchFields, ShotKind, armyDraft, armyError, releaseArmy } from '../../shared/march-fields';
import { MarchRow } from '../../shared/march-row';

/** The march being edited: a new one (id null) or a saved one; nothing is sent before "Uložiť". */
type Draft = ArmyDraft & { id: number | null };

/**
 * "Moje marche" on /marche?tab=moje (Gether 11. 10. 2026): up to 7 marches, each a compact row (MarchRow). A march is
 * filled in (MarchFields: type, commander pair, a screenshot of the equipment, the armament bonuses and inscriptions
 * typed in instead of an armaments screenshot – all required) and saved; only then the next one can be added.
 * Seen by the player, the reviewers (R4) and the superuser – and every signed-in player when the player makes them
 * public.
 */
@Component({
  selector: 'app-marches',
  imports: [Icon, MarchFields, MarchRow, NgTemplateOutlet],
  templateUrl: './marches.html',
  styleUrls: ['../kvk/kvk.scss', './marches.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Marches {
  private readonly api = inject(MarchesApi);
  protected readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.t().marches);
  protected readonly marchShots = MARCH_SHOTS;

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
  protected readonly allCommanders = computed(() => (this.commanderData.hasValue() ? this.commanderData.value() : []));
  // every portrait – a march saved before a commander was left out keeps its picture
  protected readonly portraits = computed(() => new Map(this.allCommanders().map((c) => [c.name, c.icon])));

  protected readonly draft = signal<Draft | null>(null);
  protected readonly draftError = signal<ArmyError | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly uploadError = signal<{ kind: ShotKind; error: UploadError } | null>(null);
  protected readonly armed = signal<number | null>(null);
  /** a new march can be added once nothing is being edited */
  protected readonly canAdd = computed(() => !this.draft() && this.marches().length < this.max());

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

  // ---------------------------------------------------------------- editing

  protected add(): void {
    if (!this.canAdd()) return;
    this.draft.set({ id: null, ...armyDraft() });
    this.draftError.set(null);
    this.uploadError.set(null);
  }

  protected edit(march: March): void {
    if (this.draft()) return;
    this.draft.set({ id: march.id, ...armyDraft(march) });
    this.draftError.set(null);
    this.uploadError.set(null);
  }

  protected cancel(): void {
    this.armed.set(null);
    releaseArmy(this.draft());
    this.draft.set(null);
    this.draftError.set(null);
    this.uploadError.set(null);
  }

  /** a change in MarchFields */
  protected update(value: ArmyDraft): void {
    this.draft.update((d) => (d ? { ...d, ...value } : d));
    this.draftError.set(null);
    this.uploadError.set(null);
  }

  protected async save(): Promise<void> {
    const draft = this.draft();
    if (!draft || this.busy()) return;
    const missing = armyError(draft, { kind: true, shots: MARCH_SHOTS, stats: true });
    if (missing) return this.draftError.set(missing);
    const change = { kind: draft.kind, primary: draft.primary, secondary: draft.secondary, ...draft.stats };
    await this.run(async () => {
      let march = draft.id === null ? await this.api.add(change) : await this.api.update(draft.id, change);
      for (const image of draft.removed) await this.api.removeImage(image.id);
      march = { ...march, images: march.images.filter((i) => !draft.removed.some((r) => r.id === i.id)) };
      // the march exists now: a failed upload keeps the editor open on it, the player only picks that file again
      let current: Draft = { ...draft, id: march.id, removed: [] };
      for (const kind of MARCH_SHOTS) {
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
      releaseArmy(draft);
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

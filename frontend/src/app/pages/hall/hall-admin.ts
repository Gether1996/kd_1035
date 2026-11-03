import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ArmoryData, armoryIndex } from '../../core/armory';
import { cs } from '../../core/i18n/cs';
import { I18n } from '../../core/i18n/i18n';
import { sk } from '../../core/i18n/sk';
import { marchIcon } from '../../core/kvk-api';
import { Icon } from '../../shared/icon';
import { plural } from '../reminders/format';
import { EquipmentData, EquipmentPlayer } from '../evaluation/equipment';
import { equipmentWinners } from './equipment-winners';
import {
  EQUIPMENT_TROOPS,
  EquipmentTroop,
  HALL_ICONS,
  HALL_ORDER,
  HallArchive,
  HallCategory,
  HallData,
  HallEntry,
  archiveDate,
  portrait,
  troopOfPlace,
} from './hall-data';

/** a player of the website to choose from (the superadmin's list of players, /api/kvk/reviewers/) */
interface Choice {
  id: number;
  name: string;
  ingame_name: string;
  approved: boolean;
}

/** what the form of one place holds */
interface Draft {
  player: number | null;
  name: string;
  noteSk: string;
  noteCs: string;
  /** '' = none */
  count: string;
}

type Problem = 'name' | 'photo' | 'failed';

/** "Načítať z Top 5 equip": nothing yet, loading, the winners to confirm, nobody has any equipment, failed */
type EquipmentLoad = 'idle' | 'loading' | 'preview' | 'empty' | 'failed';

/** "Uložiť do archívu": no label, no category with names, the request failed */
type ArchiveProblem = 'label' | 'categories' | 'failed';

/**
 * The superadmin's editor of the Hall of Fame (the "Upraviť" tab of /sien-slavy, Gether 28. 10. 2026: "kde si to
 * budem vedieť editovať a nastavovať, kto kde bude, meniť tú fotku"): a form per place – a player of the website or a
 * name, the reason in SK/CZ, a photo (once the place is saved) – each saved on its own.
 */
@Component({
  selector: 'app-hall-admin',
  imports: [Icon],
  templateUrl: './hall-admin.html',
  styleUrl: './hall-admin.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HallAdmin {
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  private readonly http = inject(HttpClient);

  protected readonly order = HALL_ORDER;
  protected readonly troops = EQUIPMENT_TROOPS;
  protected readonly troopOfPlace = troopOfPlace;
  protected readonly troopIcon = marchIcon;
  protected readonly icons = HALL_ICONS;
  protected readonly portrait = portrait;
  protected readonly entries = signal<HallEntry[]>([]);
  protected readonly places = signal<Record<HallCategory, number> | null>(null);
  protected readonly players = signal<Choice[]>([]);
  protected readonly failed = signal(false);
  /** the forms by `category-place` */
  protected readonly drafts = signal<Record<string, Draft>>({});
  protected readonly busy = signal<string | null>(null);
  protected readonly saved = signal<string | null>(null);
  protected readonly problems = signal<Record<string, Problem>>({});
  protected readonly confirm = signal<string | null>(null);
  /** the best equipment from Top 5 equip – the winner of each troop type before it is written */
  protected readonly equipmentLoad = signal<EquipmentLoad>('idle');
  protected readonly winners = signal<(EquipmentPlayer | null)[]>([]);

  /** Sieň legiend: the saved archives, newest first, and the form that saves the hall into a new one */
  protected readonly archives = signal<HallArchive[]>([]);
  protected readonly archiveLabel = signal('');
  /** the ticked categories; null = the default (every filled one but the mascots) */
  protected readonly archivePick = signal<HallCategory[] | null>(null);
  protected readonly archiveProblem = signal<ArchiveProblem | null>(null);
  /** the categories with someone in them – the only ones there is something to archive of */
  protected readonly filled = computed(() =>
    this.order.filter((category) => this.entries().some((e) => e.category === category)),
  );
  protected readonly picked = computed(
    () => this.archivePick() ?? this.filled().filter((category) => category !== 'mascot'),
  );

  /** approved players first, then the others, each by name */
  protected readonly choices = computed(() =>
    [...this.players()].sort((a, b) => Number(b.approved) - Number(a.approved) || this.label(a).localeCompare(this.label(b))),
  );

  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) void this.load();
  }

  private async load(): Promise<void> {
    try {
      const [hall, players] = await Promise.all([
        firstValueFrom(this.http.get<HallData>('/api/hall/')),
        firstValueFrom(this.http.get<{ players: Choice[] }>('/api/kvk/reviewers/')),
      ]);
      this.entries.set(hall.entries);
      this.archives.set(hall.archive ?? []);
      this.places.set(hall.places ?? null);
      this.players.set(players.players);
      const drafts: Record<string, Draft> = {};
      for (const e of hall.entries) drafts[this.key(e.category, e.place)] = this.draftOf(e);
      this.drafts.set(drafts);
    } catch {
      this.failed.set(true);
    }
  }

  protected key(category: HallCategory, place: number): string {
    return `${category}-${place}`;
  }

  protected range(category: HallCategory): number[] {
    return Array.from({ length: this.places()?.[category] ?? 0 }, (_, i) => i + 1);
  }

  protected entry(category: HallCategory, place: number): HallEntry | undefined {
    return this.entries().find((e) => e.category === category && e.place === place);
  }

  protected draft(category: HallCategory, place: number): Draft {
    return this.drafts()[this.key(category, place)] ?? { player: null, name: '', noteSk: '', noteCs: '', count: '' };
  }

  protected set(category: HallCategory, place: number, change: Partial<Draft>): void {
    const key = this.key(category, place);
    this.drafts.update((d) => ({ ...d, [key]: { ...this.draft(category, place), ...change } }));
    this.saved.set(null);
  }

  protected pick(category: HallCategory, place: number, value: string): void {
    this.set(category, place, { player: value ? Number(value) : null });
  }

  protected label(p: Choice): string {
    return p.ingame_name && p.ingame_name !== p.name ? `${p.ingame_name} (${p.name})` : p.ingame_name || p.name;
  }

  protected async save(event: Event, category: HallCategory, place: number): Promise<void> {
    event.preventDefault();
    const key = this.key(category, place);
    const d = this.draft(category, place);
    if (!d.player && !d.name.trim()) return this.problem(key, 'name');
    await this.run(key, async () => {
      const entry = await firstValueFrom(
        this.http.put<HallEntry>(`/api/hall/${category}/${place}/`, {
          player: d.player,
          name: d.name.trim(),
          note_sk: d.noteSk.trim(),
          note_cs: d.noteCs.trim(),
          count: d.count.trim(),
        }),
      );
      this.store(entry);
      this.saved.set(key);
    });
  }

  protected async clear(category: HallCategory, place: number): Promise<void> {
    const key = this.key(category, place);
    this.confirm.set(null);
    await this.run(key, async () => {
      await firstValueFrom(this.http.delete(`/api/hall/${category}/${place}/`));
      this.entries.update((list) => list.filter((e) => !(e.category === category && e.place === place)));
      this.drafts.update((d) => {
        const { [key]: _gone, ...rest } = d;
        return rest;
      });
    });
  }

  protected async upload(category: HallCategory, place: number, input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const key = this.key(category, place);
    if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) return this.problem(key, 'photo');
    const form = new FormData();
    form.append('photo', file);
    await this.run(key, async () => {
      this.store(await firstValueFrom(this.http.post<HallEntry>(`/api/hall/${category}/${place}/photo/`, form)));
    });
  }

  protected async removePhoto(category: HallCategory, place: number): Promise<void> {
    await this.run(this.key(category, place), async () => {
      this.store(await firstValueFrom(this.http.delete<HallEntry>(`/api/hall/${category}/${place}/photo/`)));
    });
  }

  /**
   * The winners of Top 5 equip (/api/evaluation/equipment/ and the armory, scored in the browser exactly like its tab)
   * shown before anything is written
   */
  protected async loadEquipment(): Promise<void> {
    this.equipmentLoad.set('loading');
    this.problems.update(({ equipment: _old, ...rest }) => rest);
    try {
      const [data, armory] = await Promise.all([
        firstValueFrom(this.http.get<EquipmentData>('/api/evaluation/equipment/')),
        firstValueFrom(this.http.get<ArmoryData>('/api/armory/')),
      ]);
      const winners = equipmentWinners(data, armoryIndex(armory));
      this.winners.set(winners);
      this.equipmentLoad.set(winners.some(Boolean) ? 'preview' : 'empty');
    } catch {
      this.equipmentLoad.set('failed');
    }
  }

  /**
   * Writes the three places at once (PUT /api/hall/equipment/): the player of the website (their avatar shows), no
   * number, the troop type as the reason in SK and CZ; a troop type nobody scored in is emptied. A photo stays with a
   * player who keeps a place.
   */
  protected async applyEquipment(): Promise<void> {
    const moved = new Set<number>();
    const entries = this.winners().map((player, i) => {
      if (!player) return null;
      const troop = EQUIPMENT_TROOPS[i];
      const before = this.entries().find(
        (e) => e.category === 'equipment' && e.player === player.id && !!e.photo && !moved.has(e.id),
      );
      if (before) moved.add(before.id);
      return {
        player: player.id,
        name: '',
        count: '',
        note_sk: sk.marches.build.troops[troop],
        note_cs: cs.marches.build.troops[troop],
        photo_from: before?.id ?? null,
      };
    });
    await this.run('equipment', async () => {
      const saved = await firstValueFrom(this.http.put<{ entries: HallEntry[] }>('/api/hall/equipment/', { entries }));
      this.entries.update((list) => [...list.filter((e) => e.category !== 'equipment'), ...saved.entries]);
      this.drafts.update((d) => {
        const rest = Object.fromEntries(Object.entries(d).filter(([key]) => !key.startsWith('equipment-')));
        for (const e of saved.entries) rest[this.key(e.category, e.place)] = this.draftOf(e);
        return rest;
      });
      this.equipmentLoad.set('idle');
      this.saved.set('equipment');
    });
  }

  protected troopName(troop: EquipmentTroop): string {
    return this.t().marches.build.troops[troop];
  }

  protected togglePick(category: HallCategory): void {
    const picked = this.picked();
    this.archivePick.set(
      picked.includes(category) ? picked.filter((c) => c !== category) : [...picked, category],
    );
    this.archiveProblem.set(null);
    this.saved.set(null);
  }

  /**
   * POST /api/hall/archive/: the names, numbers and reasons of the ticked categories as they are now ("KvK 3") – the
   * hall can be rewritten after it
   */
  protected async saveArchive(event: Event): Promise<void> {
    event.preventDefault();
    const label = this.archiveLabel().trim();
    const categories = this.picked().filter((category) => this.filled().includes(category));
    if (!label) return this.archiveProblem.set('label');
    if (!categories.length) return this.archiveProblem.set('categories');
    await this.runArchive('archive', async () => {
      const saved = await firstValueFrom(
        this.http.post<{ archive: HallArchive[] }>('/api/hall/archive/', { label, categories }),
      );
      this.archives.set(saved.archive);
      this.archiveLabel.set('');
      this.archivePick.set(null);
      this.saved.set('archive');
    });
  }

  protected async deleteArchive(id: number): Promise<void> {
    this.confirm.set(null);
    await this.runArchive(`archive-${id}`, async () => {
      await firstValueFrom(this.http.delete(`/api/hall/archive/${id}/`));
      this.archives.update((list) => list.filter((a) => a.id !== id));
    });
  }

  /** "5 mien" */
  protected names(n: number): string {
    return plural(n, this.t().hall.edit.archive.names);
  }

  protected archiveDate(iso: string): string {
    return archiveDate(iso, this.i18n.locale());
  }

  private async runArchive(key: string, request: () => Promise<void>): Promise<void> {
    this.busy.set(key);
    this.saved.set(null);
    this.archiveProblem.set(null);
    try {
      await request();
    } catch (err) {
      const empty = err instanceof HttpErrorResponse && err.status === 400 && err.error?.categories;
      this.archiveProblem.set(empty ? 'categories' : 'failed');
    } finally {
      this.busy.set(null);
    }
  }

  private store(entry: HallEntry): void {
    this.entries.update((list) => [
      ...list.filter((e) => !(e.category === entry.category && e.place === entry.place)),
      entry,
    ]);
    this.drafts.update((d) => ({ ...d, [this.key(entry.category, entry.place)]: this.draftOf(entry) }));
  }

  private draftOf(e: HallEntry): Draft {
    return {
      player: e.player ?? null,
      name: e.custom_name ?? '',
      noteSk: e.note_sk ?? '',
      noteCs: e.note_cs ?? '',
      count: e.count ?? '',
    };
  }

  private problem(key: string, problem: Problem): void {
    this.problems.update((p) => ({ ...p, [key]: problem }));
  }

  /** one request of a place at a time; its problem shown under its form */
  private async run(key: string, request: () => Promise<void>): Promise<void> {
    this.busy.set(key);
    this.saved.set(null);
    this.problems.update(({ [key]: _old, ...rest }) => rest);
    try {
      await request();
    } catch (err) {
      const photo = err instanceof HttpErrorResponse && err.status === 400 && err.error?.photo;
      const name = err instanceof HttpErrorResponse && err.status === 400 && err.error?.name;
      this.problem(key, photo ? 'photo' : name ? 'name' : 'failed');
    } finally {
      this.busy.set(null);
    }
  }
}

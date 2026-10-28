import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { I18n } from '../../core/i18n/i18n';
import { Icon } from '../../shared/icon';
import { HALL_ICONS, HONOURS, HallCategory, HallData, HallEntry, TRIOS, portrait } from './hall-data';

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

const ORDER: HallCategory[] = [...HONOURS, 'zero', 'mascot'];

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

  protected readonly order = ORDER;
  protected readonly trios = TRIOS;
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
          count: /^\d+$/.test(d.count.trim()) ? Number(d.count.trim()) : null,
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
      count: e.count === null || e.count === undefined ? '' : String(e.count),
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

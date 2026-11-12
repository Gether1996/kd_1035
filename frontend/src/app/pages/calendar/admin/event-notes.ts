import { httpResource } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  PLATFORM_ID,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { EventNote, EventsAdminApi, eventNotesUrl } from '../../../core/events-admin-api';
import { I18n } from '../../../core/i18n/i18n';
import { copyText } from '../../../shared/copy-link';
import { Icon } from '../../../shared/icon';
import { NOTES_TEXTS } from './notes-texts';

/**
 * The superadmin's notes to an event in the calendar's dialog (Gether 12. 11. 2026: "ku eventu 20 GH … viaceré
 * poznámky, nech si to drží aj históriu, lebo každý raz píšem email s poradím hráčov"): a field for a new note about
 * the run open in the dialog, below it every note of the event, the newest run first – copy (for the email), edit,
 * delete after a second click. Only the superadmin sees them; they never go into the git snapshot (accounts app).
 */
@Component({
  selector: 'app-event-notes',
  imports: [Icon],
  templateUrl: './event-notes.html',
  styleUrl: './event-notes.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventNotes {
  readonly eventId = input.required<number>();
  /** the run open in the dialog (ISO); null = an irregular event without a date – the note is about the event */
  readonly runStart = input<string | null>(null);

  private readonly i18n = inject(I18n);
  protected readonly x = computed(() => NOTES_TEXTS[this.i18n.lang()]);
  private readonly api = inject(EventsAdminApi);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  protected readonly data = httpResource<{ notes: EventNote[] }>(() =>
    this.isBrowser ? eventNotesUrl(this.eventId()) : undefined,
  );
  protected readonly notes = computed(() => (this.data.hasValue() ? this.data.value().notes : []));

  protected readonly draft = signal('');
  protected readonly saving = signal(false);
  protected readonly failed = signal(false);
  /** the note being edited and its text */
  protected readonly editing = signal<number | null>(null);
  protected readonly editText = signal('');
  /** the note whose "Zmazať" was clicked once */
  protected readonly confirming = signal<number | null>(null);
  protected readonly copied = signal<number | null>(null);
  private copiedTimer: ReturnType<typeof setTimeout> | undefined;

  /** "K termínu 13. 11. 2026" for the field */
  protected readonly forRun = computed(() => {
    const start = this.runStart();
    return start ? this.x().forRun.replace('{date}', this.day(start)) : this.x().general;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.copiedTimer));
  }

  /** the run's day in UTC – game events start at 00:00 UTC */
  protected day(iso: string): string {
    return new Intl.DateTimeFormat(this.i18n.locale(), {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(iso));
  }

  /** "upravené 12. 11. 14:03" when the note changed after it was written */
  protected edited(note: EventNote): string {
    if (new Date(note.updated_at).getTime() - new Date(note.created_at).getTime() < 60_000) return '';
    const at = new Intl.DateTimeFormat(this.i18n.locale(), {
      day: 'numeric',
      month: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(note.updated_at));
    return this.x().edited.replace('{date}', at);
  }

  protected async add(): Promise<void> {
    const text = this.draft().trim();
    if (!text || this.saving()) return;
    await this.save(async () => {
      await this.api.addNote(this.eventId(), text, this.runStart());
      this.draft.set('');
    });
  }

  protected startEdit(note: EventNote): void {
    this.confirming.set(null);
    this.editing.set(note.id);
    this.editText.set(note.text);
  }

  protected async saveEdit(note: EventNote): Promise<void> {
    const text = this.editText().trim();
    if (!text || this.saving()) return;
    await this.save(async () => {
      await this.api.updateNote(note.id, text);
      this.editing.set(null);
    });
  }

  protected async remove(note: EventNote): Promise<void> {
    if (this.confirming() !== note.id) {
      this.confirming.set(note.id);
      return;
    }
    await this.save(async () => {
      await this.api.removeNote(note.id);
      this.confirming.set(null);
    });
  }

  /** straight from the click – the clipboard needs its user activation */
  protected copy(note: EventNote): void {
    void copyText(note.text).then((ok) => {
      if (!ok) return;
      this.copied.set(note.id);
      clearTimeout(this.copiedTimer);
      this.copiedTimer = setTimeout(() => this.copied.set(null), 2500);
    });
  }

  private async save(write: () => Promise<void>): Promise<void> {
    this.saving.set(true);
    this.failed.set(false);
    try {
      await write();
      this.data.reload();
    } catch {
      this.failed.set(true);
    } finally {
      this.saving.set(false);
    }
  }
}

import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it } from 'vitest';
import { EventNote } from '../../../core/events-admin-api';
import { EventNotes } from './event-notes';

const URL = '/api/events/manage/7/notes/';
const tick = async (fixture: { detectChanges(): void }) => {
  for (let i = 0; i < 3; i++) await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
};
const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

const note = (id: number, change: Partial<EventNote>): EventNote => ({
  id,
  run_start: '2026-10-30T00:00:00Z',
  text: '1. Smrťák\n2. Gether',
  created_at: '2026-10-31T18:00:00Z',
  updated_at: '2026-10-31T18:00:00Z',
  ...change,
});

async function render(notes: EventNote[], runStart: string | null = '2026-11-13T00:00:00Z') {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: PLATFORM_ID, useValue: 'browser' },
    ],
  });
  const fixture = TestBed.createComponent(EventNotes);
  fixture.componentRef.setInput('eventId', 7);
  fixture.componentRef.setInput('runStart', runStart);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  http.expectOne(URL).flush({ notes });
  await tick(fixture);
  return { fixture, http, el: fixture.nativeElement as HTMLElement };
}

describe('EventNotes – the superadmin\'s notes to an event (Gether 12. 11. 2026)', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('lists every note, the run\'s day on top and the text line by line', async () => {
    const { el } = await render([
      note(2, { run_start: '2026-11-13T00:00:00Z', text: '1. Gether', updated_at: '2026-11-14T10:05:00Z' }),
      note(1, {}),
      note(3, { run_start: null, text: 'Všeobecne' }),
    ]);
    const items = Array.from(el.querySelectorAll('.note'));
    expect(items.map((n) => text(n.querySelector('.note__run')))).toEqual(['13. 11. 2026', '30. 10. 2026', 'Bez termínu']);
    expect(el.querySelectorAll('.note__text')[1].textContent).toBe('1. Smrťák\n2. Gether');
    // edited after it was written: when
    expect(text(items[0].querySelector('.note__edited'))).toMatch(/^upravené 14\. 11\./);
    expect(items[1].querySelector('.note__edited')).toBeNull();
    expect(text(el.querySelector('.field__label'))).toBe('Nová poznámka · K termínu 13. 11. 2026');
  });

  it('saves a new note about the open run and loads the list again', async () => {
    const { fixture, http, el } = await render([]);
    expect(text(el.querySelector('.notes__empty'))).toBe('Zatiaľ žiadne poznámky.');
    const field = el.querySelector<HTMLTextAreaElement>('.notes__new textarea')!;
    field.value = '  1. Smrťák\n2. Gether \n';
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('.notes__add')!.click();
    const post = http.expectOne((r) => r.method === 'POST' && r.url === URL);
    expect(post.request.body).toEqual({ text: '1. Smrťák\n2. Gether', run_start: '2026-11-13T00:00:00Z' });
    post.flush(note(1, {}));
    await tick(fixture);
    http.expectOne(URL).flush({ notes: [note(1, {})] });
    await tick(fixture);
    expect(el.querySelector<HTMLTextAreaElement>('.notes__new textarea')!.value).toBe('');
    expect(el.querySelectorAll('.note').length).toBe(1);
  });

  it('edits a note and deletes one only on the second click', async () => {
    const { fixture, http, el } = await render([note(1, {})]);
    const buttons = () => Array.from(el.querySelectorAll<HTMLButtonElement>('.note__actions button'));
    buttons()[1].click(); // Upraviť
    fixture.detectChanges();
    const field = el.querySelector<HTMLTextAreaElement>('.note textarea')!;
    expect(field.value).toBe('1. Smrťák\n2. Gether');
    field.value = '1. Gether';
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    buttons()[0].click(); // Uložiť
    const patch = http.expectOne('/api/events/manage/notes/1/');
    expect(patch.request.body).toEqual({ text: '1. Gether' });
    patch.flush(note(1, { text: '1. Gether' }));
    await tick(fixture);
    http.expectOne(URL).flush({ notes: [note(1, { text: '1. Gether' })] });
    await tick(fixture);

    const remove = () => buttons()[2];
    remove().click();
    fixture.detectChanges();
    expect(text(remove())).toBe('Naozaj zmazať?');
    http.expectNone('/api/events/manage/notes/1/');
    remove().click();
    http.expectOne((r) => r.method === 'DELETE' && r.url === '/api/events/manage/notes/1/').flush(null);
    await tick(fixture);
    http.expectOne(URL).flush({ notes: [] });
    await tick(fixture);
    expect(el.querySelectorAll('.note').length).toBe(0);
  });

  it('an irregular event without a date: the note is about the event', async () => {
    const { el } = await render([], null);
    expect(text(el.querySelector('.field__label'))).toBe('Nová poznámka · Bez termínu');
  });
});

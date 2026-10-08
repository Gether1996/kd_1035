import { Component, signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { ReminderEvent } from '../../../core/reminders-api';
import { cs } from '../../../core/i18n/cs';
import { sk } from '../../../core/i18n/sk';
import { EventRow } from './event-row';
import { reminderLabel, repeatLabel } from './format';
import { plain } from './reminders';
import { ownMinutes } from './reminder-picker';

const EVENT: ReminderEvent = {
  id: 7,
  name_sk: 'Ruiny',
  name_cs: '',
  next_start: '2026-10-10T18:00:00Z',
  repeat_days: 7,
  irregular: false,
  offered: [60, 10],
  offsets: null,
};

@Component({
  imports: [EventRow],
  template: `<ul>
    <li
      appEventRow
      [event]="event()"
      [open]="open()"
      (toggled)="open.set(!open())"
      (changed)="changes.push($event)"
    ></li>
  </ul>`,
})
class Host {
  readonly event = signal(EVENT);
  /** most tests work with the times – the row starts open */
  readonly open = signal(true);
  readonly changes: (number[] | null)[] = [];
}

describe('reminder labels', () => {
  it('read naturally in both languages, days, hours and minutes combined', () => {
    const label = (minutes: number) => reminderLabel(minutes, sk.reminders);
    expect([0, 10, 60, 90, 1440, 1500, 1800, 2880, 3075, 7200].map(label)).toEqual([
      'pri začiatku',
      '10 min vopred',
      '1 h vopred',
      '1 h 30 min vopred',
      '1 deň vopred',
      '1 deň 1 h vopred',
      '1 deň 6 h vopred',
      '2 dni vopred',
      '2 dni 3 h 15 min vopred',
      '5 dní vopred',
    ]);
    expect(reminderLabel(4320, cs.reminders)).toBe('3 dny předem');
    expect(reminderLabel(1800, cs.reminders)).toBe('1 den 6 h předem');
    expect([0, 1, 7, 3, 10, 14, 56].map((d) => repeatLabel(d, sk.reminders))).toEqual([
      'jednorazovo',
      'denne',
      'každý týždeň',
      'každé 3 dni',
      'každých 10 dní',
      'každé 2 týždne',
      'každých 8 týždňov',
    ]);
    expect(repeatLabel(14, cs.reminders)).toBe('každé 2 týdny');
    expect(repeatLabel(56, cs.reminders)).toBe('každých 8 týdnů');
  });

  it('own time: days, hours and minutes add up, empty fields count as 0', () => {
    const own = (days: string, hours: string, minutes: string) => ownMinutes({ days, hours, minutes });
    expect(own('1', '', '')).toBe(1440);
    expect(own('', '2', '')).toBe(120);
    expect(own('1', '6', '')).toBe(1800);
    expect(own('0', '2', '30')).toBe(150);
    expect(own('', '', '90')).toBe(90);
    expect(own('7', '', '')).toBe(10080);
    // nothing, 0 (offered as "pri začiatku"), more than a week, negative or not whole
    for (const bad of [
      ['', '', ''],
      ['0', '0', '0'],
      ['7', '0', '1'],
      ['8', '', ''],
      ['', '-1', ''],
      ['', '1.5', ''],
    ]) {
      expect(own(bad[0], bad[1], bad[2])).toBeNull();
    }
  });
});

describe('EventRow', () => {
  let http: HttpTestingController;

  async function render(event: Partial<ReminderEvent> = {}, open = true) {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: '**', children: [] }]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.event.set({ ...EVENT, ...event });
    fixture.componentInstance.open.set(open);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const chips = (el: HTMLElement) => [...el.querySelectorAll('.chip')].map((c) => c.textContent?.trim());
  const flush = (offsets: number[] | null) => {
    const req = http.expectOne('/api/me/reminders/7/');
    if (offsets) req.flush({ ...EVENT, offsets });
    else req.flush(null, { status: 204, statusText: 'No Content' });
    return req.request;
  };
  /** types into the days / hours / minutes fields and submits the form (Enter) */
  const addOwn = (el: HTMLElement, ...values: string[]) => {
    el.querySelectorAll<HTMLInputElement>('.unit__input').forEach((input, i) => (input.value = values[i] ?? ''));
    el.querySelector('.own')!.dispatchEvent(new Event('submit'));
  };

  afterEach(() => http.verify());

  it('switching on picks the shortest offered time and saves it', async () => {
    const { fixture, el } = await render();
    expect(el.querySelector('.chips')).toBeNull();
    el.querySelector<HTMLInputElement>('.switch')!.click();
    const put = flush([10]);
    expect(put.method).toBe('PUT');
    expect(put.body).toEqual({ offsets: [10] });
    await fixture.whenStable();
    expect(chips(el)).toEqual(['10 min vopred', '1 h vopred']);
    expect(el.querySelector<HTMLInputElement>('.chip input')!.checked).toBe(true);
    expect(el.querySelector('.picker__state')?.textContent).toContain('Uložené.');
    expect(el.querySelector('.switch')?.getAttribute('aria-describedby')).toBe('event-7');
  });

  it('changes made while saving are sent afterwards, in order', async () => {
    const { fixture, el } = await render({ offsets: [10] });
    const [ten, hour] = el.querySelectorAll<HTMLInputElement>('.chip input');
    hour.click(); // [60, 10] → request 1
    ten.click(); // [60] → waits
    const first = http.expectOne('/api/me/reminders/7/');
    expect(first.request.body).toEqual({ offsets: [60, 10] });
    first.flush({ ...EVENT, offsets: [60, 10] });
    await fixture.whenStable();
    expect(flush([60]).body).toEqual({ offsets: [60] });
    await fixture.whenStable();
  });

  it('adds an own time from days, hours and minutes and refuses an invalid one', async () => {
    const { fixture, el } = await render({ offsets: [10] });
    const fields = el.querySelectorAll<HTMLInputElement>('.unit__input');
    expect([...fields].map((f) => f.closest('label')?.textContent?.trim())).toEqual(['dni', 'h', 'min']);

    addOwn(el, '8');
    await fixture.whenStable();
    expect(fields[0].getAttribute('aria-invalid')).toBe('true');
    expect(el.querySelector('.own__hint')?.textContent).toContain('1 min až 7 dní');
    addOwn(el, '', '', '');
    await fixture.whenStable();
    expect(el.querySelector('.own__hint')?.textContent).toContain('1 min až 7 dní');

    addOwn(el, '1');
    expect(flush([1440, 10]).body).toEqual({ offsets: [1440, 10] });
    await fixture.whenStable();
    expect([...fields].map((f) => f.value)).toEqual(['', '', '']); // cleared for the next one
    addOwn(el, '', '2');
    expect(flush([1440, 120, 10]).body).toEqual({ offsets: [1440, 120, 10] });
    await fixture.whenStable();
    addOwn(el, '1', '6', '');
    expect(flush([1800, 1440, 120, 10]).body).toEqual({ offsets: [1800, 1440, 120, 10] });
    await fixture.whenStable();
    expect(chips(el)).toEqual(['10 min vopred', '1 h vopred', '2 h vopred', '1 deň vopred', '1 deň 6 h vopred']);

    // own times are removed with their × (shortest first), removing the last times stops the reminders
    for (const left of [[1800, 1440, 10], [1800, 10], [10]]) {
      el.querySelector<HTMLButtonElement>('.chip__remove')!.click();
      expect(flush(left).body).toEqual({ offsets: left });
      await fixture.whenStable();
    }
    el.querySelector<HTMLInputElement>('.chip input')!.click();
    expect(flush(null).method).toBe('DELETE');
    await fixture.whenStable();
    expect(el.querySelector('.chips')).toBeNull();
  });

  it('at most five times', async () => {
    const { fixture, el } = await render({ offsets: [100, 90, 80, 70, 10] });
    const hour = el.querySelectorAll<HTMLInputElement>('.chip input')[1];
    expect(hour.disabled).toBe(true);
    addOwn(el, '', '', '5');
    await fixture.whenStable();
    http.expectNone('/api/me/reminders/7/');
    expect(el.querySelector<HTMLInputElement>('.unit__input')!.disabled).toBe(false); // keeps keyboard focus
    expect(el.querySelector('.own__add')?.getAttribute('aria-disabled')).toBe('true');
    expect(el.querySelector('.own__hint')?.textContent).toContain('Najviac 5');
  });

  it('shows a failed save and the Czech name', async () => {
    const { fixture, el } = await render({ name_cs: 'Ruiny CZ' });
    await TestBed.inject(Router).navigateByUrl('/cz/ucet');
    await fixture.whenStable();
    expect(el.querySelector('.event__name')?.textContent).toContain('Ruiny CZ');
    expect(el.querySelector('.event__repeat')?.textContent).toContain('každý týden');
    el.querySelector<HTMLInputElement>('.switch')!.click();
    http.expectOne('/api/me/reminders/7/').flush('down', { status: 502, statusText: 'Bad Gateway' });
    await fixture.whenStable();
    expect(el.querySelector('.picker__state')?.textContent).toContain('Nepodařilo se uložit');
    expect([...el.querySelectorAll('.unit__name')].map((u) => u.textContent)).toEqual(['dny', 'h', 'min']);
  });

  it('a closed row is compact: the times as a summary and a button to open them', async () => {
    const { fixture, el } = await render({ offsets: [1800, 60] }, false);
    expect(el.querySelector('.chips')).toBeNull();
    expect([...el.querySelectorAll('.event__summary li')].map((li) => li.textContent)).toEqual([
      '1 deň 6 h vopred',
      '1 h vopred',
    ]);
    const open = el.querySelector<HTMLButtonElement>('.pill-btn')!;
    expect(open.textContent).toContain('Upraviť');
    expect(open.getAttribute('aria-expanded')).toBe('false');
    open.click();
    await fixture.whenStable();
    expect(el.querySelector('.chips')).not.toBeNull();
    expect(el.querySelector('.event__summary')).toBeNull();
    expect(open.getAttribute('aria-expanded')).toBe('true');
    expect(open.textContent).toContain('Zavrieť');
  });

  it('Zrušiť stops the reminders of the event', async () => {
    const { fixture, el } = await render({ offsets: [60] }, false);
    el.querySelector<HTMLButtonElement>('.event__stop')!.click();
    expect(flush(null).method).toBe('DELETE');
    await fixture.whenStable();
    expect(el.querySelector('.event__summary')).toBeNull();
    expect(el.querySelector('.event__stop')).toBeNull();
    expect(el.querySelector('.pill-btn')?.textContent).toContain('Nastaviť');
    expect(fixture.componentInstance.changes).toEqual([null]);
  });

  it('search ignores case and diacritics', () => {
    expect(plain('  MGE – Pěchota ')).toBe('mge – pechota');
    expect(plain('Lukostrelci')).toBe(plain('LUKOSTRELCI'));
  });

  it('an irregular event without a date says it will be announced', async () => {
    const { el } = await render({ next_start: null, repeat_days: 0, irregular: true });
    expect(el.querySelector('time')).toBeNull();
    expect(el.querySelector('.event__when')?.textContent).toContain('Ďalší termín oznámime');
    expect(el.querySelector('.event__repeat')?.textContent).toContain('nepravidelne');
  });
});

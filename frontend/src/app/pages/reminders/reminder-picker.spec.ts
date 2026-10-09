import { Component, signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { ReminderEvent } from '../../../core/reminders-api';
import { cs } from '../../../core/i18n/cs';
import { sk } from '../../../core/i18n/sk';
import { reminderLabel, repeatLabel } from './format';
import { ReminderPicker, ownMinutes } from './reminder-picker';

const EVENT: ReminderEvent = {
  id: 7,
  name_sk: 'Ruiny',
  name_cs: '',
  icon: null,
  next_start: '2026-10-10T18:00:00Z',
  repeat_days: 7,
  irregular: false,
  offered: [60, 10],
  offsets: null,
};

@Component({
  imports: [ReminderPicker],
  template: `<p id="event-7">Ruiny</p>
    <app-reminder-picker
      [event]="event()"
      describedBy="event-7"
      (changed)="changes.push($event)"
    />`,
})
class Host {
  readonly event = signal(EVENT);
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
    const own = (days: string, hours: string, minutes: string) =>
      ownMinutes({ days, hours, minutes });
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

describe('ReminderPicker', () => {
  let http: HttpTestingController;

  async function render(event: Partial<ReminderEvent> = {}) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '**', children: [] }]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.event.set({ ...EVENT, ...event });
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const chips = (el: HTMLElement) =>
    [...el.querySelectorAll('.chip')].map((c) => c.textContent?.trim());
  const flush = (offsets: number[] | null) => {
    const req = http.expectOne('/api/me/reminders/7/');
    if (offsets) req.flush({ ...EVENT, offsets });
    else req.flush(null, { status: 204, statusText: 'No Content' });
    return req.request;
  };
  /** types into the days / hours / minutes fields and submits the form (Enter) */
  const addOwn = (el: HTMLElement, ...values: string[]) => {
    el.querySelectorAll<HTMLInputElement>('.unit__input').forEach(
      (input, i) => (input.value = values[i] ?? ''),
    );
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
    expect([...fields].map((f) => f.closest('label')?.textContent?.trim())).toEqual([
      'dni',
      'h',
      'min',
    ]);

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
    expect(chips(el)).toEqual([
      '10 min vopred',
      '1 h vopred',
      '2 h vopred',
      '1 deň vopred',
      '1 deň 6 h vopred',
    ]);

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

  it('shows a failed save in Czech, with the Czech name read by the switch', async () => {
    const { fixture, el } = await render({ name_cs: 'Ruiny CZ' });
    await TestBed.inject(Router).navigateByUrl('/cz/ucet');
    await fixture.whenStable();
    expect(el.querySelector('.switch')?.getAttribute('aria-label')).toBe('Připomínat: Ruiny CZ');
    el.querySelector<HTMLInputElement>('.switch')!.click();
    http
      .expectOne('/api/me/reminders/7/')
      .flush('down', { status: 502, statusText: 'Bad Gateway' });
    await fixture.whenStable();
    expect(el.querySelector('.picker__state')?.textContent).toContain('Nepodařilo se uložit');
    expect([...el.querySelectorAll('.unit__name')].map((u) => u.textContent)).toEqual([
      'dny',
      'h',
      'min',
    ]);
  });
});

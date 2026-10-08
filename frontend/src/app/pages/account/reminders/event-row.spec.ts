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

const EVENT: ReminderEvent = {
  id: 7,
  name_sk: 'Ruiny',
  name_cs: '',
  next_start: '2026-10-10T18:00:00Z',
  repeat_days: 7,
  offered: [60, 10],
  offsets: null,
};

@Component({
  imports: [EventRow],
  template: `<ul>
    <li appEventRow [event]="event()"></li>
  </ul>`,
})
class Host {
  readonly event = signal(EVENT);
}

describe('reminder labels', () => {
  it('reads naturally in both languages', () => {
    const label = (minutes: number) => reminderLabel(minutes, sk.reminders);
    expect([0, 10, 60, 90, 1440, 2880, 7200].map(label)).toEqual([
      'pri začiatku',
      '10 min vopred',
      '1 h vopred',
      '1 h 30 min vopred',
      '1 deň vopred',
      '2 dni vopred',
      '5 dní vopred',
    ]);
    expect(reminderLabel(4320, cs.reminders)).toBe('3 dny předem');
    expect([0, 1, 7, 3, 14].map((d) => repeatLabel(d, sk.reminders))).toEqual([
      'jednorazovo',
      'denne',
      'každý týždeň',
      'každé 3 dni',
      'každých 14 dní',
    ]);
    expect(repeatLabel(14, cs.reminders)).toBe('každých 14 dní');
  });
});

describe('EventRow', () => {
  let http: HttpTestingController;

  async function render(event: Partial<ReminderEvent> = {}) {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: '**', children: [] }]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.event.set({ ...EVENT, ...event });
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
    expect(el.querySelector('.event__state')?.textContent).toContain('Uložené.');
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

  it('adds an own time and refuses an invalid one', async () => {
    const { fixture, el } = await render({ offsets: [10] });
    const input = el.querySelector<HTMLInputElement>('.own input')!;
    const form = el.querySelector<HTMLFormElement>('.own')!;
    input.value = '10081';
    form.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(el.querySelector('.own__hint')?.textContent).toContain('10080');

    input.value = '25';
    form.dispatchEvent(new Event('submit'));
    expect(flush([25, 10]).body).toEqual({ offsets: [25, 10] });
    await fixture.whenStable();
    expect(chips(el)).toEqual(['10 min vopred', '1 h vopred', '25 min vopred']);

    // removing the last times stops the reminders
    el.querySelector<HTMLButtonElement>('.chip__remove')!.click();
    flush([10]);
    await fixture.whenStable();
    el.querySelector<HTMLInputElement>('.chip input')!.click();
    expect(flush(null).method).toBe('DELETE');
    await fixture.whenStable();
    expect(el.querySelector('.chips')).toBeNull();
  });

  it('at most five times', async () => {
    const { fixture, el } = await render({ offsets: [100, 90, 80, 70, 10] });
    const hour = el.querySelectorAll<HTMLInputElement>('.chip input')[1];
    expect(hour.disabled).toBe(true);
    const input = el.querySelector<HTMLInputElement>('.own input')!;
    input.value = '5';
    el.querySelector('.own')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    http.expectNone('/api/me/reminders/7/');
    expect(input.disabled).toBe(false); // keeps keyboard focus
    expect(el.querySelector('.own button')?.getAttribute('aria-disabled')).toBe('true');
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
    expect(el.querySelector('.event__state')?.textContent).toContain('Nepodařilo se uložit');
  });
});

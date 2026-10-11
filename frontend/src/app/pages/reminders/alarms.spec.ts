import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Alarms, targetOf } from './alarms';

const NOW = new Date('2026-10-11T12:00:00Z');

describe('alarm time', () => {
  it('adds days, hours and minutes to now, or reads a local date and time', () => {
    expect(targetOf('in', { days: 0, hours: 7, minutes: 30 }, '', NOW)?.toISOString()).toBe('2026-10-11T19:30:00.000Z');
    expect(targetOf('in', { days: 1, hours: 0, minutes: 0 }, '', NOW)?.toISOString()).toBe('2026-10-12T12:00:00.000Z');
    expect(targetOf('in', { days: 0, hours: 0, minutes: 0 }, '', NOW)).toBeNull();
    expect(targetOf('at', { days: 0, hours: 0, minutes: 0 }, '', NOW)).toBeNull();
    expect(targetOf('at', { days: 0, hours: 0, minutes: 0 }, '2026-10-12T19:30', NOW)).toEqual(new Date('2026-10-12T19:30'));
  });
});

describe('Alarms', () => {
  beforeEach(() => {
    // the listed alarms wait until 19:15 UTC on 11. 10. – a fixed clock, so they stay waiting
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
  });
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    vi.useRealTimers();
  });

  it('an alarm that already went out leaves the list; cancelling one sent meanwhile (404) removes it', async () => {
    const sent = { id: 2, note: 'Hotové', target: '2026-10-11T11:50:00Z', remind_at: '2026-10-11T11:45:00Z' };
    const { fixture, el, http } = await render([
      { id: 1, note: 'Končí mi štít', target: '2026-10-11T19:30:00Z', remind_at: '2026-10-11T19:15:00Z' },
      sent,
    ]);
    expect([...el.querySelectorAll('.alarm__note')].map((n) => n.textContent)).toEqual(['Končí mi štít']);
    expect(el.querySelector('.alarms__count')?.textContent).toBe('1/5');
    el.querySelector<HTMLButtonElement>('.alarm .icon-btn')!.click();
    http.expectOne('/api/me/alarms/1/').flush(null, { status: 404, statusText: 'Not Found' });
    await fixture.whenStable();
    await fixture.whenStable();
    expect(el.querySelector('.alarm')).toBeNull();
  });

  async function render(alarms = [{ id: 1, note: 'Končí mi štít', target: '2026-10-11T19:30:00Z', remind_at: '2026-10-11T19:15:00Z' }]) {
    const fixture = TestBed.createComponent(Alarms);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne('/api/me/alarms/').flush({ alarms, max: 5 });
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement, http: TestBed.inject(HttpTestingController) };
  }

  const type = (input: HTMLInputElement, value: string) => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };

  it('lists waiting alarms and cancels one', async () => {
    const { fixture, el, http } = await render();
    expect(el.querySelector('.alarm__note')?.textContent).toBe('Končí mi štít');
    expect(el.querySelector('.alarms__count')?.textContent).toBe('1/5');

    el.querySelector<HTMLButtonElement>('.alarm .icon-btn')!.click();
    const req = http.expectOne('/api/me/alarms/1/');
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();
    await fixture.whenStable();
    expect(el.querySelector('.alarm')).toBeNull();
  });

  it('sends the target and the lead, and says why a time was refused', async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    try {
      const { fixture, el, http } = await render([]);
      el.querySelector<HTMLButtonElement>('.alarms__head .pill-btn')!.click();
      await fixture.whenStable();

      // nothing filled in
      el.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
      await fixture.whenStable();
      expect(el.querySelector('.alarm-form__summary')?.textContent).toContain('Zadaj');

      el.querySelector<HTMLButtonElement>('.idea')!.click();
      const [, hours, minutes] = Array.from(el.querySelectorAll<HTMLInputElement>('.unit__input'));
      type(hours, '7');
      type(minutes, '30');
      const lead = el.querySelector<HTMLSelectElement>('#alarm-lead')!;
      lead.value = '15';
      lead.dispatchEvent(new Event('change'));
      await fixture.whenStable();
      expect(el.querySelector('.alarm-form__summary')?.textContent).toContain('Bot ti napíše');

      el.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
      const req = http.expectOne('/api/me/alarms/');
      expect(req.request.body).toEqual({ target: '2026-10-11T19:30:00.000Z', lead: 15, note: 'Končí mi štít' });
      req.flush({ target: ['too_soon'] }, { status: 400, statusText: 'Bad Request' });
      await fixture.whenStable();
      await fixture.whenStable();
      expect(el.querySelector('.alarm-form__summary')?.textContent).toContain('Tento čas už je preč');

      el.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
      http
        .expectOne('/api/me/alarms/')
        .flush({ id: 2, note: 'Končí mi štít', target: '2026-10-11T19:30:00Z', remind_at: '2026-10-11T19:15:00Z' });
      await fixture.whenStable();
      await fixture.whenStable();
      expect(el.querySelector('form')).toBeNull();
      expect(el.querySelector('.alarm__note')?.textContent).toBe('Končí mi štít');
    } finally {
      vi.useRealTimers();
    }
  });

  it('warns when the bot messages are off', async () => {
    const { fixture, el } = await render([]);
    fixture.componentRef.setInput('off', true);
    await fixture.whenStable();
    expect(el.querySelector('.alarms__warn')?.textContent).toContain('vypnuté');
  });
});

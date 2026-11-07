import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { ManageData, ManagedEvent } from '../../../core/events-admin-api';
import { DateDialog } from './date-dialog';

const silk = (history: ManagedEvent['history']): ManagedEvent => ({
  id: 1,
  name_sk: 'Silk Road',
  name_cs: '',
  icon: '',
  icon_url: null,
  message: '',
  starts_at: '2026-10-01T18:00:00Z',
  duration_minutes: 60,
  repeat_days: 0,
  until: null,
  irregular: true,
  time_basis: 'local',
  reminders: [],
  notify_discord: false,
  mention_role: false,
  mention_role_id: '',
  show_on_web: true,
  player_reminders: [],
  guide: null,
  is_active: true,
  next_start: null,
  usual_time: '20:00',
  players: 0,
  variants: [],
  history,
});

function render(history: ManagedEvent['history']) {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
  });
  const fixture = TestBed.createComponent(DateDialog);
  const data: ManageData = { events: [silk(history)], icons: [], guides: [], reminder_choices: [], webhook: true };
  fixture.componentRef.setInput('data', data);
  fixture.componentRef.setInput('day', '2026-11-20');
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

describe('DateDialog – the dates an irregular event had (Gether 7. 11. 2026)', () => {
  it('shows them, the usual gap and a guess that fills in the day and the hour', () => {
    const { fixture, el } = render({
      dates: ['2026-10-09T18:00:00Z', '2026-09-11T18:00:00Z'],
      every_days: 28,
      guess: '2026-11-06T19:00:00Z',
    });
    expect(text(el.querySelector('#date-history'))).toBe('Minulé termíny');
    expect(text(el.querySelector('.history__dates'))).toBe('9. 10. 2026 · 11. 9. 2026');
    expect(text(el.querySelector('.history__every'))).toBe('Zvyčajne každých 28 dní.');
    expect(text(el.querySelector('.history__guess span'))).toContain('Odhad ďalšieho:');
    const day = el.querySelector<HTMLInputElement>('#date-day')!;
    const time = el.querySelector<HTMLInputElement>('#date-time')!;
    expect(day.value).toBe('2026-11-20');
    el.querySelector<HTMLButtonElement>('.history__guess button')!.click();
    fixture.detectChanges();
    // in our time: 20:00 in Bratislava (UTC+1 in November)
    expect([day.value, time.value]).toEqual(['2026-11-06', '20:00']);
  });

  it('says the dates will be written down when there are none yet', () => {
    const { el } = render({ dates: [], every_days: null, guess: null });
    expect(text(el.querySelector('.history'))).toContain('Zatiaľ žiadny');
    expect(el.querySelector('.history__guess')).toBeNull();
  });

  it('one date: no gap, no guess', () => {
    const { el } = render({ dates: ['2026-10-09T18:00:00Z'], every_days: null, guess: null });
    expect(text(el.querySelector('.history__dates'))).toBe('9. 10. 2026');
    expect(el.querySelector('.history__every')).toBeNull();
    expect(el.querySelector('.history__guess')).toBeNull();
  });
});

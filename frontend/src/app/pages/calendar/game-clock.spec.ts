import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { GameClock, hoursMinutes, minutesUntil, nextReset } from './game-clock';

const left = (iso: string) => {
  const now = new Date(iso);
  return hoursMinutes(minutesUntil(now, nextReset(now)));
};

describe('game clock', () => {
  it('counts down to 00:00 UTC in hours and minutes', () => {
    expect(left('2026-10-11T00:00:00Z')).toBe('24 h'); // the reset just happened – the next one
    expect(left('2026-10-11T23:59:30Z')).toBe('1 min'); // rounded up, never "0 min" before the reset
    expect(left('2026-10-11T23:00:00Z')).toBe('1 h');
    expect(left('2026-10-11T14:32:10Z')).toBe('9 h 28 min');
  });

  it('puts the reset on the next UTC day', () => {
    expect(nextReset(new Date('2026-10-31T23:10:00Z')).toISOString()).toBe('2026-11-01T00:00:00.000Z');
  });

  describe('component', () => {
    afterEach(() => vi.useRealTimers());

    it('shows UTC time, the countdown and the reset in local time, and ticks on the minute', async () => {
      vi.useFakeTimers({ now: new Date('2026-10-11T14:32:30Z') });
      TestBed.configureTestingModule({ providers: [provideRouter([])] });
      const fixture = TestBed.createComponent(GameClock);
      fixture.detectChanges();
      await fixture.whenStable();
      const text = () => fixture.nativeElement.textContent.replace(/\s+/g, ' ');
      expect(text()).toContain('14:32 UTC');
      expect(text()).toContain('9 h 28 min');
      expect(text()).toMatch(/reset o \d\d:00 tvojho času/);

      vi.advanceTimersByTime(30_100);
      await fixture.whenStable();
      expect(text()).toContain('14:33 UTC');
      expect(text()).toContain('9 h 27 min');

      vi.advanceTimersByTime(60_000);
      await fixture.whenStable();
      expect(text()).toContain('14:34 UTC');

      // both timers stop with the component
      fixture.destroy();
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});

import { describe, expect, it } from 'vitest';
import { SITE_VERSION } from '../../core/version';
import { CHANGES } from './changes';

describe('Changelog (/novinky)', () => {
  it('starts with the current version, so every release says what is new', () => {
    expect(CHANGES[0].version).toBe(SITE_VERSION);
  });

  it('has each day once, newest first, with the same lines in both languages', () => {
    const dates = CHANGES.map((c) => c.date);
    expect(new Set(dates).size).toBe(dates.length);
    expect([...dates].sort().reverse()).toEqual(dates);
    for (const change of CHANGES) {
      expect(change.date, change.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(change.sk.length, change.date).toBeGreaterThan(0);
      expect(change.cs.length, change.date).toBe(change.sk.length);
      expect([...change.sk, ...change.cs].every((line) => line.trim() && !line.includes('*')), change.date).toBe(true);
    }
  });

  it('never has a higher version on an older day (compared as numbers, 1.32.10 > 1.32.9)', () => {
    const parts = (version: string) => version.split('.').map(Number);
    for (const change of CHANGES) expect(change.version, change.date).toMatch(/^\d+\.\d+\.\d+$/);
    for (let i = 1; i < CHANGES.length; i++) {
      const [newer, older] = [parts(CHANGES[i - 1].version), parts(CHANGES[i].version)];
      const diff = newer.map((n, j) => n - older[j]).find((d) => d !== 0) ?? 0;
      expect(diff, `${CHANGES[i].date} ${CHANGES[i].version} > ${CHANGES[i - 1].version}`).toBeGreaterThanOrEqual(0);
    }
  });
});

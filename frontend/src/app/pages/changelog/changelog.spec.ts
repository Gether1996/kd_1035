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
});

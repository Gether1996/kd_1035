import { describe, expect, it } from 'vitest';
import { parseGameNumber, shortGameNumber } from './game-number';

describe('game numbers (kill points, deads)', () => {
  it('reads them as the game shows them or whole', () => {
    const cases: [string, number | null | undefined][] = [
      ['', null],
      ['  ', null],
      ['8.8B', 8_800_000_000],
      ['8,8 B', 8_800_000_000],
      ['8,8 mld', 8_800_000_000],
      ['24M', 24_000_000],
      ['24 mil.', 24_000_000],
      ['350K', 350_000],
      ['350 tis.', 350_000],
      ['8 800 000 000', 8_800_000_000],
      ['8,800,000,000', 8_800_000_000],
      ['8.800.000.000', 8_800_000_000],
      ['123456', 123_456],
      ['8.8', undefined],
      ['8,80', undefined],
      ['-5', undefined],
      ['abc', undefined],
      ['5x', undefined],
    ];
    for (const [text, value] of cases) expect(parseGameNumber(text), text).toBe(value);
  });

  it('a plain small number in the field\'s unit: kill points in billions, the acclaim in millions (Smrťák 16. 11. 2026)', () => {
    expect(parseGameNumber('9', 1e9)).toBe(9_000_000_000);
    expect(parseGameNumber('8,8', 1e9)).toBe(8_800_000_000);
    expect(parseGameNumber('79,5', 1e6)).toBe(79_500_000);
    expect(parseGameNumber('79.5', 1e6)).toBe(79_500_000);
    // a unit or thousands separators win
    expect(parseGameNumber('350K', 1e6)).toBe(350_000);
    expect(parseGameNumber('79,500,000', 1e6)).toBe(79_500_000);
    // a whole number from the game stays as it is
    expect(parseGameNumber('79500000', 1e6)).toBe(79_500_000);
    expect(parseGameNumber('8.8')).toBeUndefined();
  });

  it('shows them short like the game', () => {
    expect([8_800_000_000, 115_000_000, 24_000_000, 1_250_000_000_0, 350_000, 9_999, 0].map(shortGameNumber)).toEqual([
      '8.8B',
      '115M',
      '24M',
      '12.5B',
      '350K',
      '9999',
      '0',
    ]);
  });
});

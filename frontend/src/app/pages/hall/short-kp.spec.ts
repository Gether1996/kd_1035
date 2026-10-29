import { describe, expect, it } from 'vitest';
import { centreOut, shortKp } from './hall-page';

describe('shortKp', () => {
  it('says kill points in billions and millions, one decimal, like the game', () => {
    expect([2_273_581_583, 1_371_748_481, 1_353_071_554, 842_998_273, 3_000_000_000, 950_000].map(shortKp)).toEqual([
      '2.3B',
      '1.4B',
      '1.4B',
      '843M',
      '3B',
      '950000',
    ]);
  });
});

describe('centreOut', () => {
  const col = (name: string, size: number) => ({ name, entries: Array(size).fill(0) });
  const names = (cols: { name: string }[]) => cols.map((c) => c.name);

  it('puts the longest banner in the middle and the shorter ones towards the sides', () => {
    expect(names(centreOut([col('leader', 1), col('forts', 3), col('kp', 5)]))).toEqual(['forts', 'kp', 'leader']);
    expect(names(centreOut([col('a', 1), col('b', 2), col('c', 4), col('d', 3), col('e', 1)]))).toEqual([
      'a',
      'd',
      'c',
      'b',
      'e',
    ]);
  });

  it('keeps the given order among equals', () => {
    expect(names(centreOut([col('a', 1), col('b', 1)]))).toEqual(['b', 'a']);
    expect(names(centreOut([]))).toEqual([]);
  });
});

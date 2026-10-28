import { describe, expect, it } from 'vitest';
import { shortKp } from './hall-page';

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

import { describe, expect, it } from 'vitest';
import { overviewChanges, overviewRows } from './overview';
import { Evaluation, PlayerEval } from './scoring';

const row = (
  id: number,
  change: { approved?: boolean; counted?: number; missing?: number; required?: number; power?: number; ownLimit?: number },
): PlayerEval =>
  ({
    player: { id, approved: change.approved ?? true, power: change.power ?? null },
    counted: change.counted ?? 0,
    missing: change.missing ?? 0,
    ownLimit: change.ownLimit ?? null,
    acclaim: { required: change.required ?? 200_000 },
  }) as unknown as PlayerEval;

describe('the published required acclaim', () => {
  it('publishes the approved players the estimate counts something for, the highest first', () => {
    const evaluation = {
      rows: [
        row(1, { counted: 3, required: 1_000_000, power: 95.4, ownLimit: 88.66 }),
        // only the power: the marches it asks for
        row(2, { missing: 5, required: 2_000_000 }),
        // nothing to count
        row(3, {}),
        row(4, { approved: false, counted: 5, required: 9_000_000 }),
      ],
    } as Evaluation;
    expect(overviewRows(evaluation)).toEqual([
      { id: 2, marches: 0, missing: 5, required: 2_000_000, power: null, recommended: null },
      { id: 1, marches: 3, missing: 0, required: 1_000_000, power: 95.4, recommended: 88.7 },
    ]);
  });

  it('counts the players who would see something else', () => {
    const a = { id: 1, marches: 3, missing: 0, required: 1_000_000, power: 95, recommended: 88 };
    const b = { id: 2, marches: 5, missing: 0, required: 2_000_000, power: null, recommended: 101 };
    expect(overviewChanges([a, b], [b, a])).toBe(0);
    // changed, gone, new
    expect(overviewChanges([a, b], [{ ...a, required: 1_100_000 }])).toBe(2);
    expect(overviewChanges([a], [a, b])).toBe(1);
    expect(overviewChanges([], [a, b])).toBe(2);
    expect(overviewChanges([a, b], [a, { ...b, power: 99 }])).toBe(1);
  });
});

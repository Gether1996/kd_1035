import { Evaluation } from './scoring';

/**
 * "Požadovaný acclaim" (Gether 14. 10. 2026: a plain overview for the players, nothing to edit). The estimate is
 * counted in the browser from data the players must not get (the pair table, everyone's power), so an evaluator
 * publishes what it counts and the players with the overview switch read only that (/api/evaluation/overview/).
 */

/** one published row as the evaluators send and get it */
export interface OverviewRow {
  id: number;
  marches: number;
  /** marches the power asks for on top */
  missing: number;
  required: number;
  /** the power in millions (null = not written down) and the most the counted marches carry (null = none counted) –
   * Gether 14. 10. 2026: "kombinovaná aktuálna power / odporúčaná power" */
  power: number | null;
  recommended: number | null;
}

/** what the players with the overview switch see */
export interface OverviewPlayer extends OverviewRow {
  /** the name in the game, Discord as the fallback */
  name: string;
  avatar_url: string;
  /** the reader's own row */
  you: boolean;
}

export interface Overview<T extends OverviewRow = OverviewRow> {
  /** null = nothing published */
  published_at: string | null;
  rows: T[];
}

/** the approved players the estimate counts something for – no marches and no power = nothing to ask */
export function overviewRows(evaluation: Evaluation): OverviewRow[] {
  return evaluation.rows
    .filter((r) => r.player.approved && r.counted + r.missing > 0)
    .map((r) => ({
      id: r.player.id,
      marches: r.counted,
      missing: r.missing,
      required: r.acclaim.required,
      power: tenth(r.player.power),
      recommended: tenth(r.ownLimit),
    }))
    .sort((a, b) => b.required - a.required || a.id - b.id);
}

const tenth = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);

const KEYS = ['required', 'marches', 'missing', 'power', 'recommended'] as const;

/** the power above what the counted marches carry – red, the "+N" marches say how many the power asks for */
export const overOwn = (row: Pick<OverviewRow, 'power' | 'recommended'>) =>
  row.power !== null && row.recommended !== null && row.power > row.recommended;

/** how many players would see something else after publishing again (new, gone or changed) */
export function overviewChanges(published: OverviewRow[], now: OverviewRow[]): number {
  const before = new Map(published.map((r) => [r.id, r]));
  let changes = 0;
  for (const row of now) {
    const old = before.get(row.id);
    const same = old && KEYS.every((key) => (old[key] ?? null) === row[key]);
    if (!same) changes++;
    before.delete(row.id);
  }
  return changes + before.size;
}

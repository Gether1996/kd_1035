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
    .map((r) => ({ id: r.player.id, marches: r.counted, missing: r.missing, required: r.acclaim.required }))
    .sort((a, b) => b.required - a.required || a.id - b.id);
}

/** how many players would see something else after publishing again (new, gone or changed) */
export function overviewChanges(published: OverviewRow[], now: OverviewRow[]): number {
  const before = new Map(published.map((r) => [r.id, r]));
  let changes = 0;
  for (const row of now) {
    const old = before.get(row.id);
    if (!old || old.required !== row.required || old.marches !== row.marches || old.missing !== row.missing) changes++;
    before.delete(row.id);
  }
  return changes + before.size;
}

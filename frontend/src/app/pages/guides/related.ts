import { GuideSummary } from '../../core/guides-api';

type Ranked = Pick<GuideSummary, 'slug' | 'category' | 'specialty'>;

/**
 * "Súvisiace návody" under a guide: the same specialty scores 2 (cavalry pairs → cavalry gear), the same category 1;
 * guides with no match are left out. Ties keep the API order (category, order), so a guide without a specialty gets
 * the first guides of its category. `all` holds published guides only (the list API).
 */
export function relatedGuides<T extends Ranked>(current: Ranked, all: readonly T[], max = 3): T[] {
  const score = (g: T) =>
    (current.specialty && g.specialty === current.specialty ? 2 : 0) + (g.category === current.category ? 1 : 0);
  return all
    .filter((g) => g.slug !== current.slug)
    .map((g) => ({ g, score: score(g) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score) // stable: equal scores stay in the API order
    .slice(0, max)
    .map(({ g }) => g);
}

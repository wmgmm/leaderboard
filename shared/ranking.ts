import type { BoardRow, Reaction, ReactionKind } from './types';

// A happy face is worth two neutral ones; a sad face scores nothing. Points are still
// counted and sent, but the chart no longer ranks by them (see sortByScore).
export const REACTION_POINTS: Record<ReactionKind, number> = { happy: 2, neutral: 1, sad: 0 };

// The chart ranks by how well a prompt is liked, not by how many votes it has, because
// some prompts are shown to more people than others (Matt, 11 Nov 2026). A prompt's score
// is its average face: loved 100%, OK 50%, not for me 0%.
interface Tally { happy: number; neutral: number; sad: number }
const votesOf = (t: Tally) => t.happy + t.neutral + t.sad;
const liked = (t: Tally) => t.happy + t.neutral / 2;

/** The score shown beside a prompt, as a whole percentage, or null with no votes. */
export function scoreOf(t: Tally): number | null {
  const n = votesOf(t);
  return n ? Math.round((liked(t) / n) * 100) : null;
}

// With only a vote or two a score says little: one happy face is 100%. So for ranking,
// each prompt is treated as if it also had this many votes at the chart's average score.
// The more real votes it has, the less that matters.
export const PRIOR_VOTES = 3;

/**
 * Best first, by score steadied as above. Prompts with no votes go last. `tie` settles
 * the order between equals and among the unvoted.
 */
export function sortByScore<T extends Tally>(rows: T[], tie: (a: T, b: T) => number): T[] {
  const total = rows.reduce((sum, r) => sum + votesOf(r), 0);
  const average = total ? rows.reduce((sum, r) => sum + liked(r), 0) / total : 0.5;
  const steadied = (r: T) => (liked(r) + PRIOR_VOTES * average) / (votesOf(r) + PRIOR_VOTES);
  return rows.slice().sort((a, b) => {
    const [na, nb] = [votesOf(a), votesOf(b)];
    if (!na || !nb) return (nb ? 1 : 0) - (na ? 1 : 0) || tie(a, b);
    return steadied(b) - steadied(a) || nb - na || tie(a, b);
  });
}

/** How many people gave one prompt one face, and how many of those were in the last few minutes. */
export interface Count { promptId: string; kind: ReactionKind; n: number; recent: number }

/** Chart rows, best first, from counts. Ties keep the session's own prompt order. */
export function rankByCounts(promptIds: string[], counts: Count[]): BoardRow[] {
  const rows = new Map<string, BoardRow>();
  for (const id of promptIds) rows.set(id, { id, rank: 0, points: 0, happy: 0, neutral: 0, sad: 0, recent: 0 });
  for (const c of counts) {
    const row = rows.get(c.promptId);
    if (!row) continue;
    row[c.kind] += c.n;
    row.points += c.n * REACTION_POINTS[c.kind];
    row.recent += c.recent;
  }
  const order = new Map<string, number>();
  promptIds.forEach((id, i) => order.set(id, i));
  const sorted = sortByScore(Array.from(rows.values()), (a, b) => order.get(a.id)! - order.get(b.id)!);
  sorted.forEach((row, i) => (row.rank = i + 1));
  return sorted;
}

/** The same, from one row per vote. */
export function rankByReactions(promptIds: string[], reactions: Reaction[]): BoardRow[] {
  return rankByCounts(promptIds, reactions.map((r) => ({ promptId: r.promptId, kind: r.kind, n: 1, recent: r.recent ? 1 : 0 })));
}

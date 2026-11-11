import type { BoardRow, Reaction, ReactionKind } from './types';

// What each face is worth (Matt, 11 Nov 2026): loved +3, OK +1, not for me -3. An OK still
// counts in a prompt's favour, a little; a "not for me" costs as much as a "loved" earns.
// The chart ranks by the average of these per vote, not their total (see sortByScore).
export const REACTION_POINTS: Record<ReactionKind, number> = { happy: 3, neutral: 1, sad: -3 };

// The chart ranks by how well a prompt is liked, not by how many votes it has, because
// some prompts are shown to more people than others (Matt, 11 Nov 2026).
interface Tally { happy: number; neutral: number; sad: number }
const votesOf = (t: Tally) => t.happy + t.neutral + t.sad;
// A prompt's average points per vote, moved from the range -3..+3 onto 0..1.
const [LOW, HIGH] = [REACTION_POINTS.sad, REACTION_POINTS.happy];
const liked = (t: Tally) =>
  (t.happy * REACTION_POINTS.happy + t.neutral * REACTION_POINTS.neutral + t.sad * REACTION_POINTS.sad - votesOf(t) * LOW) / (HIGH - LOW);

/** How many of a prompt's voters loved it, as a whole percentage, or null with no votes. */
export function lovedPercent(t: Tally): number | null {
  const n = votesOf(t);
  return n ? Math.round((t.happy / n) * 100) : null;
}

// THE SCORE, out of 10, is what the chart ranks by and shows. It is the prompt's average
// points per vote put on a 0 to 10 scale (all loved is 10, all OK is 6.7, all not for me
// is 0), steadied for prompts with few votes: each prompt is
// scored as if it also had this many votes at the chart's overall average. One happy face
// alone would be a perfect 10; with the steadying it is a little above average, and a
// prompt earns a high or low score only as real votes pile up. With many votes the score
// is simply its average face.
export const PRIOR_VOTES = 5;

/**
 * Best first by score, with the score written on each row (null with no votes). Prompts
 * with no votes go last. `tie` settles the order between equals and among the unvoted.
 */
export function sortByScore<T extends Tally & { score?: number | null }>(rows: T[], tie: (a: T, b: T) => number): T[] {
  const total = rows.reduce((sum, r) => sum + votesOf(r), 0);
  const average = total ? rows.reduce((sum, r) => sum + liked(r), 0) / total : 0.5;
  const steadied = (r: T) => (liked(r) + PRIOR_VOTES * average) / (votesOf(r) + PRIOR_VOTES);
  for (const r of rows) r.score = votesOf(r) ? Math.round(steadied(r) * 100) / 10 : null;
  return rows.slice().sort((a, b) => {
    const [na, nb] = [votesOf(a), votesOf(b)];
    if (!na || !nb) return (nb ? 1 : 0) - (na ? 1 : 0) || tie(a, b);
    // By the score as shown. Level on screen: the higher % loved goes first (Matt,
    // 11 Nov 2026), then the one with more votes behind it.
    return b.score! - a.score! || b.happy / nb - a.happy / na || nb - na || tie(a, b);
  });
}

/** How many people gave one prompt one face, and how many of those were in the last few minutes. */
export interface Count { promptId: string; kind: ReactionKind; n: number; recent: number }

/** Chart rows, best first, from counts. Ties keep the session's own prompt order. */
export function rankByCounts(promptIds: string[], counts: Count[]): BoardRow[] {
  const rows = new Map<string, BoardRow>();
  for (const id of promptIds) rows.set(id, { id, rank: 0, points: 0, score: null, happy: 0, neutral: 0, sad: 0, recent: 0 });
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

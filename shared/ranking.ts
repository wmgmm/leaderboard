import type { BoardRow, Reaction, ReactionKind } from './types';

// A happy face is worth two neutral ones; a sad face scores nothing.
export const REACTION_POINTS: Record<ReactionKind, number> = { happy: 2, neutral: 1, sad: 0 };

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
  const sorted = Array.from(rows.values()).sort(
    (a, b) => b.points - a.points || order.get(a.id)! - order.get(b.id)!,
  );
  sorted.forEach((row, i) => (row.rank = i + 1));
  return sorted;
}

/** The same, from one row per vote. */
export function rankByReactions(promptIds: string[], reactions: Reaction[]): BoardRow[] {
  return rankByCounts(promptIds, reactions.map((r) => ({ promptId: r.promptId, kind: r.kind, n: 1, recent: r.recent ? 1 : 0 })));
}

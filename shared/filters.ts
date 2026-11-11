import type { BoardRow } from './types';

// The views a facilitator can switch the chart between. "community" is the list staff
// have added themselves, which comes from a different place, so it has no rule here.
export type FilterKey = 'all' | 'loved' | 'marmite' | 'disliked' | 'unrated' | 'community';

export const votesOf = (r: Pick<BoardRow, 'happy' | 'neutral' | 'sad'>) => r.happy + r.neutral + r.sad;

/** Splitting the room: at least 4 votes, and both the happy and the sad camps hold 30%. */
export function isMarmite(r: Pick<BoardRow, 'happy' | 'neutral' | 'sad'>): boolean {
  const votes = votesOf(r);
  return votes >= 4 && r.happy / votes >= 0.3 && r.sad / votes >= 0.3;
}

/** A clear favourite: at least 3 votes, 70% of them happy. */
export function isLoved(r: Pick<BoardRow, 'happy' | 'neutral' | 'sad'>): boolean {
  const votes = votesOf(r);
  return votes >= 3 && r.happy / votes >= 0.7;
}

/** Not landing: at least 3 votes, half or more of them sad, and more sad than happy (an even split is Marmite, not disliked). */
export function isDisliked(r: Pick<BoardRow, 'happy' | 'neutral' | 'sad'>): boolean {
  const votes = votesOf(r);
  return votes >= 3 && r.sad / votes >= 0.5 && r.sad > r.happy;
}

/**
 * The rows a view shows, in the order it shows them. Rows keep their chart position
 * (`rank`), so a filtered view still says where each prompt stands overall.
 */
export function applyFilter(key: Exclude<FilterKey, 'community'>, rows: BoardRow[]): BoardRow[] {
  switch (key) {
    case 'loved': return rows.filter(isLoved).sort((a, b) => b.happy - a.happy || a.rank - b.rank);
    // Most evenly split first: the size of the smaller camp.
    case 'marmite': return rows.filter(isMarmite).sort((a, b) => Math.min(b.happy, b.sad) - Math.min(a.happy, a.sad) || a.rank - b.rank);
    case 'disliked': return rows.filter(isDisliked).sort((a, b) => b.sad - a.sad || a.rank - b.rank);
    case 'unrated': return rows.filter((r) => votesOf(r) === 0);
    default: return rows;
  }
}

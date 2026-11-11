import { isMarmite } from './filters';
import type { BoardRow } from './types';

/** A live tag shown beside a prompt on the attendee page, chart-show style. */
export interface Buzz {
  key: 'unloved' | 'top' | 'viral' | 'trending' | 'pleaser' | 'marmite' | 'gem' | 'tough';
  emoji: string;
  label: string;
}

const TAG: Record<Buzz['key'], Omit<Buzz, 'key'>> = {
  unloved: { emoji: '\u{1F97A}', label: 'Feeling unloved' },
  top: { emoji: '\u{1F451}', label: 'Number one' },
  viral: { emoji: '\u{1F680}', label: 'Going viral' },
  trending: { emoji: '\u{1F525}', label: 'Trending' },
  pleaser: { emoji: '\u{1F49B}', label: 'Crowd pleaser' },
  marmite: { emoji: '\u{1F937}', label: 'Marmite' },
  gem: { emoji: '\u{1F48E}', label: 'Hidden gem' },
  tough: { emoji: '\u{1F976}', label: 'Tough crowd' },
};

// A prompt only counts as unloved once this many people have voted on something else.
const UNLOVED_AFTER_VOTERS = 3;

const tag = (key: Buzz['key']): Buzz => ({ key, ...TAG[key] });

/**
 * The one tag a prompt has earned, or null. Checked in order, so the first rule
 * that fits wins. `voters` is how many people have voted in the session at all.
 */
export function buzzFor(row: BoardRow, voters: number): Buzz | null {
  const votes = row.happy + row.neutral + row.sad;
  // Nobody has voted on it, though people are voting. Before anyone has voted at all,
  // every prompt would qualify, which says nothing.
  if (votes === 0) return voters >= UNLOVED_AFTER_VOTERS ? tag('unloved') : null;
  const happyShare = row.happy / votes;
  const sadShare = row.sad / votes;
  if (row.rank === 1 && votes >= 3 && row.points > 0) return tag('top');
  if (happyShare >= 0.6 && row.recent >= Math.max(4, Math.ceil(voters * 0.3))) return tag('viral');
  if (happyShare >= 0.6 && row.recent >= 2) return tag('trending');
  if (votes >= 4 && happyShare >= 0.8) return tag('pleaser');
  if (isMarmite(row)) return tag('marmite'); // the same rule as the chart's Marmite view
  if (votes <= 2 && row.happy === votes && voters >= 4) return tag('gem');
  if (votes >= 4 && sadShare >= 0.6) return tag('tough');
  return null;
}

// "Feeling unloved" on every unvoted prompt is a wall of sad faces, so only a couple
// wear it at a time. The pick changes every few minutes and is the same for everyone.
export const UNLOVED_SHOWN = 2;
const UNLOVED_SLOT_MS = 5 * 60 * 1000;

/** Which of the unloved prompt ids show the tag just now. */
export function pickUnloved(ids: string[], now: number, shown = UNLOVED_SHOWN): string[] {
  const slot = Math.floor(now / UNLOVED_SLOT_MS);
  const score = (id: string) => { // a well-mixed number from the id and the time slot
    let h = (slot + 0x9e3779b9) | 0;
    for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d);
    h ^= h >>> 12;
    return h >>> 0;
  };
  return ids.slice().sort((a, b) => score(a) - score(b) || (a < b ? -1 : 1)).slice(0, shown);
}

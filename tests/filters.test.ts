import { describe, expect, it } from 'vitest';
import { applyFilter, isDisliked, isLoved, isMarmite } from '../shared/filters';
import type { BoardRow } from '../shared/types';

const row = (id: string, rank: number, happy: number, neutral: number, sad: number): BoardRow =>
  ({ id, rank, happy, neutral, sad, points: happy * 2 + neutral, recent: 0 });

const rows = [
  row('fav', 1, 8, 1, 0),      // clear favourite
  row('split', 2, 5, 0, 4),    // Marmite
  row('okay', 3, 2, 5, 1),     // middling
  row('split2', 4, 2, 0, 2),   // Marmite, but a smaller row
  row('flop', 5, 1, 1, 6),     // disliked
  row('new', 6, 1, 0, 0),      // too few votes to call
  row('none', 7, 0, 0, 0),     // nobody has voted
];
const ids = (key: Parameters<typeof applyFilter>[0]) => applyFilter(key, rows).map((r) => r.id);

describe('chart views', () => {
  it('shows everything, in chart order, by default', () => expect(ids('all')).toEqual(rows.map((r) => r.id)));
  it('finds the clear favourites', () => expect(ids('loved')).toEqual(['fav']));
  it('finds the prompts that split the room, most evenly split first', () => expect(ids('marmite')).toEqual(['split', 'split2']));
  it('finds the ones not landing, most disliked first', () => expect(ids('disliked')).toEqual(['flop']));
  it('finds the ones nobody has voted on', () => expect(ids('unrated')).toEqual(['none']));
  it('keeps each row\'s overall chart position', () => expect(applyFilter('disliked', rows)[0].rank).toBe(5));
  it('does not judge a prompt on one or two votes', () => {
    const lone = row('x', 1, 1, 0, 0);
    expect([isLoved(lone), isDisliked(row('y', 1, 0, 0, 2)), isMarmite(row('z', 1, 1, 0, 1))]).toEqual([false, false, false]);
  });
});

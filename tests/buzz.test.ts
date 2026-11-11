import { describe, expect, it } from 'vitest';
import { buzzFor, pickUnloved } from '../shared/buzz';
import type { BoardRow } from '../shared/types';

const row = (over: Partial<BoardRow>): BoardRow =>
  ({ id: 'p01', rank: 5, points: 0, happy: 0, neutral: 0, sad: 0, recent: 0, ...over });
const key = (over: Partial<BoardRow>, voters = 20) => buzzFor(row(over), voters)?.key ?? null;

describe('buzzFor', () => {
  it('calls a prompt unloved once others are getting votes and it is not', () => {
    expect(key({}, 3)).toBe('unloved');
    expect(key({}, 2)).toBe(null); // too early: nobody has really started
    expect(key({ sad: 1 }, 20)).not.toBe('unloved'); // a sad face is still attention
  });
  it('crowns number one once three people have voted', () => {
    expect(key({ rank: 1, happy: 3, points: 6 })).toBe('top');
    expect(key({ rank: 1, happy: 2, points: 4 }, 2)).toBe(null);
  });
  it('needs a third of the room in five minutes to go viral', () => {
    expect(key({ happy: 7, recent: 6 })).toBe('viral');
    expect(key({ happy: 7, recent: 5 })).toBe('trending');
  });
  it('does not call a disliked prompt trending, however busy', () => {
    expect(key({ sad: 5, happy: 1, recent: 6 })).toBe('tough');
  });
  it('spots a crowd pleaser, a Marmite prompt and a hidden gem', () => {
    expect(key({ happy: 5, neutral: 1 })).toBe('pleaser');
    expect(key({ happy: 3, sad: 3 })).toBe('marmite');
    expect(key({ happy: 1 })).toBe('gem');
    expect(key({ happy: 1 }, 2)).toBe(null); // too few voters for "few have tried it" to mean much
  });
  it('says nothing about a middling prompt', () => expect(key({ happy: 2, neutral: 3 })).toBe(null));
});

describe('pickUnloved', () => {
  const ids = Array.from({ length: 40 }, (_, i) => 'p' + ('0' + (i + 1)).slice(-2));
  const MIN = 60000;
  it('shows the tag on two prompts only, the same two for everyone in that moment', () => {
    const a = pickUnloved(ids, 20 * MIN);
    expect(a).toHaveLength(2);
    expect(pickUnloved(ids.slice().reverse(), 21 * MIN)).toEqual(a); // same slot, any order in
  });
  it('moves on to different prompts later', () => {
    const picks = new Set([0, 5, 10, 15, 20, 25].map((m) => pickUnloved(ids, m * MIN).join()));
    expect(picks.size).toBeGreaterThan(3);
  });
  it('copes with fewer unloved prompts than tags', () => expect(pickUnloved(['p01'], 0)).toEqual(['p01']));
});

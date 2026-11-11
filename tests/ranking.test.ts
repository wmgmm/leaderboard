import { describe, expect, it } from 'vitest';
import { rankByReactions } from '../shared/ranking';

describe('rankByReactions', () => {
  it('ranks by points and keeps session order on ties', () => {
    const rows = rankByReactions(['p01', 'p02', 'p03'], [
      { voter: 'a', promptId: 'p03', kind: 'happy' },
      { voter: 'b', promptId: 'p03', kind: 'neutral' },
      { voter: 'a', promptId: 'p02', kind: 'sad' },
    ]);
    expect(rows.map((r) => [r.id, r.rank, r.points])).toEqual([['p03', 1, 3], ['p01', 2, 0], ['p02', 3, 0]]);
    expect(rows[0]).toMatchObject({ happy: 1, neutral: 1, sad: 0 });
  });

  it('ignores reactions for prompts outside the session', () => {
    const rows = rankByReactions(['p01'], [{ voter: 'a', promptId: 'p09', kind: 'happy' }]);
    expect(rows).toEqual([{ id: 'p01', rank: 1, points: 0, happy: 0, neutral: 0, sad: 0, recent: 0 }]);
  });
});

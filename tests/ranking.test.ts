import { describe, expect, it } from 'vitest';
import { rankByReactions, scoreOf } from '../shared/ranking';

describe('rankByReactions', () => {
  const votes = (promptId: string, happy: number, neutral: number, sad: number) => [
    ...Array.from({ length: happy }, (_, i) => ({ voter: `h${i}`, promptId, kind: 'happy' as const })),
    ...Array.from({ length: neutral }, (_, i) => ({ voter: `n${i}`, promptId, kind: 'neutral' as const })),
    ...Array.from({ length: sad }, (_, i) => ({ voter: `s${i}`, promptId, kind: 'sad' as const })),
  ];
  const order = (rows: { id: string }[]) => rows.map((r) => r.id);

  it('ranks by how well a prompt is liked, not by how many people saw it', () => {
    // p01 was shown to 11 people and has the most points; p02 was shown to 5 and is liked more.
    const rows = rankByReactions(['p01', 'p02'], [...votes('p01', 6, 2, 3), ...votes('p02', 4, 1, 0)]);
    expect(order(rows)).toEqual(['p02', 'p01']);
    expect(rows.map((r) => r.points)).toEqual([9, 14]); // the counts are all still there
    expect(rows.map(scoreOf)).toEqual([90, 64]);
  });

  it('does not let one lucky vote beat a well-liked prompt with many votes', () => {
    const rows = rankByReactions(['p01', 'p02', 'p03'], [...votes('p01', 1, 0, 0), ...votes('p02', 9, 1, 0), ...votes('p03', 2, 2, 6)]);
    expect(order(rows)).toEqual(['p02', 'p01', 'p03']);
  });

  it('puts prompts nobody has voted on last, in session order, with no score', () => {
    const rows = rankByReactions(['p01', 'p02', 'p03'], votes('p03', 0, 0, 2));
    expect(rows.map((r) => [r.id, r.rank])).toEqual([['p03', 1], ['p01', 2], ['p02', 3]]);
    expect(rows.map(scoreOf)).toEqual([0, null, null]);
  });

  it('keeps session order between prompts with the same votes', () => {
    const rows = rankByReactions(['p01', 'p02'], [...votes('p02', 1, 1, 0), ...votes('p01', 1, 1, 0)]);
    expect(order(rows)).toEqual(['p01', 'p02']);
    expect(rows[0]).toMatchObject({ happy: 1, neutral: 1, sad: 0, points: 3 });
  });

  it('ignores reactions for prompts outside the session', () => {
    const rows = rankByReactions(['p01'], [{ voter: 'a', promptId: 'p09', kind: 'happy' }]);
    expect(rows).toEqual([{ id: 'p01', rank: 1, points: 0, happy: 0, neutral: 0, sad: 0, recent: 0 }]);
  });
});

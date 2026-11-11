import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../server/app';
import { openDb } from '../server/db';
import type { Db } from '../server/db';
import { NEW_VOTERS_PER_HOUR, WRITES_PER_MINUTE, createLimits } from '../server/limits';
import type { Board, CommunityItem } from '../shared/types';

const KEY = 'a-test-passphrase-of-some-length';
const auth = { 'x-facilitator-key': KEY };
let db: Db;
let app: ReturnType<typeof createApp>;

const json = (method: string, body: unknown, headers: Record<string, string> = {}) => ({
  method, body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers },
});
const list = async () => (await (await app.request('/api/community')).json()) as CommunityItem[];
/** A suggestion sent in and then approved by the facilitator, so it is on the list. */
const share = async (voter: string, purpose: string, prompt = '') => {
  const res = await app.request('/api/community', json('POST', { voter, purpose, prompt }));
  if (res.status === 201) await app.request(`/api/community/${((await res.clone().json()) as { id: number }).id}/approve`, { method: 'POST', headers: auth });
  return res;
};

beforeAll(async () => {
  db = await openDb();
  app = createApp(db, KEY);
  await db.query("INSERT INTO sessions (code, name, prompt_ids) VALUES ('ROOM', 'Room', $1)", [['p01', 'p02']]);
});

describe('limits per network address', () => {
  it('caps writes per minute, then lets them through again', () => {
    let t = 0;
    const limits = createLimits(() => t);
    for (let i = 0; i < WRITES_PER_MINUTE; i++) expect(limits.check('10.0.0.1', 'voter-aaaa')).toBe('');
    expect(limits.check('10.0.0.1', 'voter-aaaa')).toMatch(/Too much/);
    expect(limits.check('10.0.0.2', 'voter-aaaa')).toBe(''); // another network is unaffected
    t += 60000;
    expect(limits.check('10.0.0.1', 'voter-aaaa')).toBe('');
  });
  it('caps how many different voters one address can invent in an hour', () => {
    let t = 0;
    const limits = createLimits(() => t);
    for (let i = 0; i < NEW_VOTERS_PER_HOUR; i++) {
      if (i % 500 === 499) t += 60000;
      expect(limits.check('10.0.0.9', `voter-${i}`)).toBe('');
    }
    expect(limits.check('10.0.0.9', 'voter-one-too-many')).toMatch(/Too many people/);
    expect(limits.check('10.0.0.9', 'voter-5')).toBe(''); // someone already seen can still vote
    t += 3600000;
    expect(limits.check('10.0.0.9', 'voter-one-too-many')).toBe('');
  });
});

describe('the facilitator passphrase', () => {
  it('can be checked on its own, and a wrong one is refused', async () => {
    expect((await app.request('/api/facilitator/check', { headers: auth })).status).toBe(204);
    expect((await app.request('/api/facilitator/check', { headers: { 'x-facilitator-key': 'guess' } })).status).toBe(401);
    expect((await app.request('/api/facilitator/check')).status).toBe(401);
  });
});

describe('request size', () => {
  it('refuses a body far larger than any honest request', async () => {
    const res = await app.request('/api/community', {
      method: 'POST', body: JSON.stringify({ voter: 'voter-big1', purpose: 'x'.repeat(20000) }),
      headers: { 'content-type': 'application/json', 'content-length': '20040' },
    });
    expect(res.status).toBe(413);
  });
});

describe('removing community prompts', () => {
  it('wipes the words of a removed entry, not just hides it', async () => {
    await share('voter-rem1', 'Something with a name in it', 'Dear Sam');
    const id = (await list())[0].id;
    expect((await app.request(`/api/community/${id}`, { method: 'DELETE', headers: auth })).status).toBe(204);
    const row = await db.query<{ purpose: string; prompt: string; is_hidden: boolean }>('SELECT purpose, prompt, is_hidden FROM community_prompts WHERE id = $1', [id]);
    expect(row[0]).toEqual({ purpose: '[removed]', prompt: '', is_hidden: true });
  });
  it('answers 404, not a crash, for an id that is not a number or is absurdly large', async () => {
    expect((await app.request('/api/community/abc', { method: 'DELETE', headers: auth })).status).toBe(404);
    expect((await app.request('/api/community/99999999999999999999/reactions', json('PUT', { voter: 'voter-rem1', kind: 'happy' }))).status).toBe(400);
  });
  it('removes everything from the last few minutes in one go, for a flood', async () => {
    await share('voter-fl01', 'Flood one');
    await share('voter-fl02', 'Flood two');
    expect((await list()).length).toBe(2);
    expect((await app.request('/api/community/remove-recent', json('POST', { minutes: 10 }))).status).toBe(401);
    const res = await app.request('/api/community/remove-recent', json('POST', { minutes: 10 }, auth));
    expect(await res.json()).toEqual({ removed: 2 });
    expect(await list()).toEqual([]);
  });
  it('refuses a title made only of invisible characters', async () => {
    const res = await app.request('/api/community', json('POST', { voter: 'voter-inv1', purpose: '\u200B\u200B\u200B\u200B' }));
    expect(res.status).toBe(400);
  });
  it('strips characters that are not text', async () => {
    await share('voter-ctl1', 'Tidy\u0000 notes\u0007', 'line one\nline\u0000 two');
    const item = (await list())[0];
    expect([item.purpose, item.prompt]).toEqual(['Tidy notes', 'line one\nline two']);
  });
});

describe('a vote that hits the limit for a network', () => {
  it('is answered as "try later" (503), which browsers hold and send again, never as a refusal', async () => {
    const busy = createApp(await openDb(), KEY);
    const made = await busy.request('/api/sessions', json('POST', { name: 'Busy room', promptIds: ['p01', 'p02'] }, auth));
    const { code } = (await made.json()) as { code: string };
    const vote = (n: number) => busy.request(`/api/sessions/${code}/reactions`, json('PUT', { voter: `voter-busy${n % 50}`, promptId: 'p01', kind: 'happy' }));
    for (let i = 0; i < WRITES_PER_MINUTE; i++) await vote(i);
    expect((await vote(1)).status).toBe(503);
    // The same for a prompt shared in that minute: held and sent again, not thrown away.
    expect((await busy.request('/api/community', json('POST', { voter: 'voter-busy1', purpose: 'Shared in a busy minute' }))).status).toBe(503);
  }, 60000);

  it('leaves room for 60 people swiping a card a second, and for everyone sending at once after an outage', () => {
    expect(WRITES_PER_MINUTE).toBeGreaterThanOrEqual(6000);
  });
});

describe('the kill switch for community prompts', () => {
  it('answers 503 so pages hold the entry and say nothing', async () => {
    const paused = createApp(await openDb(), KEY, { communityOpen: false });
    const res = await paused.request('/api/community', json('POST', { voter: 'voter-off1', purpose: 'Held for later' }));
    expect(res.status).toBe(503);
  });
});

describe('clearing votes', () => {
  const vote = (voter: string, promptId: string) => app.request('/api/sessions/ROOM/reactions', json('PUT', { voter, promptId, kind: 'happy' }));
  const board = async () => (await (await app.request('/api/sessions/ROOM/board')).json()) as Board;
  it('needs the passphrase, and clears a session without touching another', async () => {
    await vote('voter-cv01', 'p01');
    await vote('voter-cv02', 'p01');
    expect((await board()).voters).toBe(2);
    expect((await app.request('/api/sessions/ROOM/clear-votes', json('POST', {}))).status).toBe(401);
    const res = await app.request('/api/sessions/ROOM/clear-votes', json('POST', {}, auth));
    expect(await res.json()).toEqual({ cleared: 2 });
    const after = await board();
    expect([after.voters, after.rows[0].happy]).toEqual([0, 0]);
    // Off the chart, but kept: votes are never destroyed.
    const kept = await db.query<{ voter: string; kind: string }>("SELECT voter, kind FROM reactions_archive WHERE session_code = 'ROOM' ORDER BY voter");
    expect(kept).toEqual([{ voter: 'voter-cv01', kind: 'happy' }, { voter: 'voter-cv02', kind: 'happy' }]);
  });
  it('can clear only the last few minutes', async () => {
    await vote('voter-cv03', 'p02');
    await db.query("UPDATE reactions SET updated_at = now() - interval '2 hours' WHERE voter = 'voter-cv03'");
    await vote('voter-cv04', 'p02');
    const res = await app.request('/api/sessions/ROOM/clear-votes', json('POST', { minutes: 30 }, auth));
    expect(await res.json()).toEqual({ cleared: 1 });
    expect((await board()).rows.find((r) => r.id === 'p02')!.happy).toBe(1);
    expect((await db.query("SELECT 1 FROM reactions_archive WHERE voter = 'voter-cv04'")).length).toBe(1);
  });
});

describe('the backup download', () => {
  it('needs the passphrase and holds every vote, live and cleared', async () => {
    expect((await app.request('/api/facilitator/export')).status).toBe(401);
    const res = await app.request('/api/facilitator/export', { headers: auth });
    expect(res.status).toBe(200);
    const all = (await res.json()) as Record<string, unknown[]>;
    expect(Object.keys(all).sort()).toEqual(['community_prompts', 'community_votes', 'exported_at', 'reactions', 'reactions_archive', 'sessions']);
    for (const table of ['reactions', 'reactions_archive', 'sessions', 'community_prompts', 'community_votes']) {
      const rows = await db.query(`SELECT count(*) AS n FROM ${table}`);
      expect(all[table].length).toBe(Number((rows[0] as { n: string | number }).n));
    }
    expect(all.reactions_archive.length).toBeGreaterThan(0);
  });
});

describe('the chart counts', () => {
  it('counts voters and recent votes in the database, ignoring prompts no longer in the session', async () => {
    // Left by the tests above: one vote on p02, two hours old. Add a fresh one, and one on a prompt outside the session.
    await app.request('/api/sessions/ROOM/reactions', json('PUT', { voter: 'voter-cv05', promptId: 'p02', kind: 'happy' }));
    await db.query("INSERT INTO reactions (session_code, voter, prompt_id, kind) VALUES ('ROOM', 'voter-old1', 'p09', 'happy')");
    const res = (await (await app.request('/api/sessions/ROOM/board')).json()) as Board;
    expect(res.rows.map((r) => r.id).sort()).toEqual(['p01', 'p02']);
    expect(res.voters).toBe(2); // voter-cv03 and voter-cv05; the vote on p09 does not count
    expect(res.rows.find((r) => r.id === 'p02')).toMatchObject({ happy: 2, recent: 1 });
  });
});

describe("today's chart", () => {
  it("is built from today's votes alone, and leaves out prompts nobody voted on today", async () => {
    const room = createApp(await openDb(), KEY);
    const made = await room.request('/api/sessions', json('POST', { name: 'Day room', promptIds: ['p01', 'p02', 'p03'] }, auth));
    const { code } = (await made.json()) as { code: string };
    const vote = (voter: string, promptId: string, kind: string) => room.request(`/api/sessions/${code}/reactions`, json('PUT', { voter, promptId, kind }));
    await vote('voter-day1', 'p01', 'sad');
    await vote('voter-day2', 'p01', 'sad');
    await vote('voter-day3', 'p02', 'happy');
    const before = (await (await room.request(`/api/sessions/${code}/board`)).json()) as Board;
    expect(before.today).toMatchObject({ voters: 3 });
    expect(before.today!.rows.map((r) => [r.id, r.rank, r.happy, r.sad])).toEqual([['p02', 1, 1, 0], ['p01', 2, 0, 2]]);
  });
  it('drops votes from an earlier day, which stay on the main chart', async () => {
    await db.query("INSERT INTO sessions (code, name, prompt_ids) VALUES ('DAYS', 'Days', $1)", [['p01', 'p02']]);
    await db.query("INSERT INTO reactions (session_code, voter, prompt_id, kind, updated_at) VALUES ('DAYS', 'voter-old9', 'p01', 'happy', now() - interval '2 days')");
    await app.request('/api/sessions/DAYS/reactions', json('PUT', { voter: 'voter-new9', promptId: 'p02', kind: 'neutral' }));
    const b = (await (await app.request('/api/sessions/DAYS/board')).json()) as Board;
    expect(b.voters).toBe(2);
    expect(b.rows.find((r) => r.id === 'p01')!.happy).toBe(1);
    expect(b.today!.voters).toBe(1);
    expect(b.today!.rows.map((r) => r.id)).toEqual(['p02']);
  });
  it("steadies today's scores at the whole chart's average, so a first vote is not a perfect 10", async () => {
    await db.query("INSERT INTO sessions (code, name, prompt_ids) VALUES ('DAY2', 'Day two', $1)", [['p01', 'p02']]);
    for (let i = 0; i < 6; i++) await db.query("INSERT INTO reactions (session_code, voter, prompt_id, kind, updated_at) VALUES ('DAY2', $1, 'p01', 'neutral', now() - interval '2 days')", [`voter-okk${i}`]);
    await app.request('/api/sessions/DAY2/reactions', json('PUT', { voter: 'voter-fst1', promptId: 'p02', kind: 'happy' }));
    const b = (await (await app.request('/api/sessions/DAY2/board')).json()) as Board;
    const score = b.today!.rows[0].score!;
    expect(b.today!.rows.length).toBe(1);
    expect(score).toBeGreaterThan(6.7); // above the chart's average...
    expect(score).toBeLessThan(8); // ...but one vote is not a 10
  });
});

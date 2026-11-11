import { createHash, timingSafeEqual } from 'node:crypto';
import { getConnInfo } from '@hono/node-server/conninfo';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { REACTION_POINTS, rankByCounts, sortByScore } from '../shared/ranking';
import { shareProblem, tidyPrompt, tidyPurpose } from '../shared/community';
import { REACTION_KINDS } from '../shared/types';
import type { Board, CommunityItem, ReactionKind, SessionInfo } from '../shared/types';
import type { Db } from './db';
import { createLimits } from './limits';

const ALLOWED_ORIGINS = ['https://wmgmm.github.io'];
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
// No I, L, O or U: codes are read aloud and typed from a projector.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ';
const VOTER = /^[A-Za-z0-9-]{8,64}$/;
// p = an exercise on the workshop page, x = an extra prompt kept in this repo.
const PROMPT_ID = /^[px]\d{2,3}$/;
// Midnight at the start of today in the UK, where the workshops are: a vote cast or changed
// since then is one of "today's" for the chart's Today view.
const TODAY_START = "date_trunc('day', now() AT TIME ZONE 'Europe/London') AT TIME ZONE 'Europe/London'";
// How long a vote counts as "recent" for the Trending and Going viral tags.
const RECENT_MINUTES = 5;

interface SessionRow {
  code: string;
  name: string;
  prompt_ids: string[];
  is_open: boolean;
  is_hidden: boolean;
}

function toInfo(row: SessionRow): SessionInfo {
  return { code: row.code, name: row.name, promptIds: row.prompt_ids, open: row.is_open, hidden: row.is_hidden };
}

// Community prompts appear straight away, with no approval step (Matt's decision,
// 2026-11-10), so these are the only guards before something is public.
const SHARES_PER_VOTER_PER_HOUR = 5;
const SHARES_PER_HOUR = 120; // a couple of workshop rooms, each person suggesting once
const COMMUNITY_LIST_MAX = 200;
const COMMUNITY_ID = /^\d{1,9}$/;
// The largest honest request is a 1,500-character prompt.
const MAX_BODY_BYTES = 8 * 1024;
// Live streams are for projectors: a handful per session. More than this is not a workshop.
const STREAMS_PER_SESSION = 20;
const STREAMS_IN_ALL = 200;

function validPromptIds(ids: unknown): ids is string[] {
  return Array.isArray(ids) && ids.length >= 2 && ids.length <= 100
    && ids.every((id) => typeof id === 'string' && PROMPT_ID.test(id))
    && new Set(ids).size === ids.length;
}

/**
 * The standing session for anyone who arrives without a room code. Generated codes
 * never contain the letter O, so OPEN cannot clash with one. Called at start-up, so
 * its prompt list always matches the current prompts.
 */
export const OPEN_CODE = 'OPEN';
export async function ensureOpenSession(db: Db, promptIds: string[]) {
  await db.query(
    `INSERT INTO sessions (code, name, prompt_ids) VALUES ($1, $2, $3)
     ON CONFLICT (code) DO UPDATE SET prompt_ids = EXCLUDED.prompt_ids`,
    [OPEN_CODE, 'Experiment and Share what you thought!', promptIds]);
}

export interface AppOptions {
  /** False turns off new community prompts (the kill switch); pages hold them quietly meanwhile. */
  communityOpen?: boolean;
}

export function createApp(db: Db, facilitatorKey: string, options: AppOptions = {}) {
  const app = new Hono();
  const listeners = new Map<string, Set<(board: Board) => void>>();
  const limits = createLimits();
  let streams = 0;

  /**
   * The caller's network address, used only to cap floods and never stored or logged
   * (see limits.ts). Behind Railway the real address is in a header set by its proxy;
   * the last entry of x-forwarded-for is the one that proxy added.
   */
  const addressOf = (c: Context): string => {
    const real = c.req.header('x-real-ip');
    if (real) return real;
    const forwarded = c.req.header('x-forwarded-for');
    if (forwarded) return forwarded.split(',').pop()!.trim();
    try { return getConnInfo(c).remote.address ?? 'unknown'; } catch { return 'unknown'; }
  };

  /** Compared in constant time, and a wrong guess costs a pause. */
  const digest = (s: string) => createHash('sha256').update(s).digest();
  async function isFacilitator(c: Context): Promise<boolean> {
    const given = c.req.header('x-facilitator-key') ?? '';
    if (facilitatorKey && timingSafeEqual(digest(given), digest(facilitatorKey))) return true;
    await new Promise((resolve) => setTimeout(resolve, 300));
    return false;
  }

  app.use('/api/*', bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: (c) => c.json({ error: 'That is too long. Trim it and try again.' }, 413),
  }));

  app.use('/api/*', cors({
    origin: (origin) => (ALLOWED_ORIGINS.includes(origin) || LOCAL_ORIGIN.test(origin) ? origin : null),
    allowHeaders: ['content-type', 'x-facilitator-key', 'x-voter'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    maxAge: 7200, // fewer extra round trips on venue Wi-Fi
  }));

  async function getSession(code: string): Promise<SessionInfo | null> {
    const rows = await db.query<SessionRow>('SELECT * FROM sessions WHERE code = $1', [code.toUpperCase()]);
    return rows.length ? toInfo(rows[0]) : null;
  }

  // Counted in the database: the answer is the same size however many votes there are.
  async function getBoard(session: SessionInfo): Promise<Board> {
    const [counts, voters] = await Promise.all([
      db.query<{ prompt_id: string; kind: ReactionKind; n: string | number; recent: string | number; today: string | number }>(
        `SELECT prompt_id, kind, count(*) AS n,
                count(*) FILTER (WHERE updated_at > now() - interval '${RECENT_MINUTES} minutes') AS recent,
                count(*) FILTER (WHERE updated_at >= ${TODAY_START}) AS today
         FROM reactions WHERE session_code = $1 AND prompt_id = ANY($2) GROUP BY prompt_id, kind`,
        [session.code, session.promptIds]),
      db.query<{ n: string | number; today: string | number }>(
        `SELECT count(DISTINCT voter) AS n, count(DISTINCT voter) FILTER (WHERE updated_at >= ${TODAY_START}) AS today
         FROM reactions WHERE session_code = $1 AND prompt_id = ANY($2)`,
        [session.code, session.promptIds]),
    ]);
    // Today's chart: the same ranking, from today's votes alone, without the prompts nobody voted on today.
    const today = rankByCounts(session.promptIds, counts.map((r) => ({ promptId: r.prompt_id, kind: r.kind, n: Number(r.today), recent: Number(r.recent) })))
      .filter((r) => r.happy + r.neutral + r.sad > 0);
    return {
      session,
      voters: Number(voters[0]?.n ?? 0),
      rows: rankByCounts(session.promptIds, counts.map((r) => ({ promptId: r.prompt_id, kind: r.kind, n: Number(r.n), recent: Number(r.recent) }))),
      today: { voters: Number(voters[0]?.today ?? 0), rows: today },
    };
  }

  async function broadcast(session: SessionInfo) {
    const subs = listeners.get(session.code);
    if (!subs || subs.size === 0) return;
    const board = await getBoard(session);
    subs.forEach((send) => send(board));
  }

  app.get('/api/health', (c) => c.json({ ok: true }));

  // Lets the facilitator page find out whether a passphrase is right before showing its tools.
  app.get('/api/facilitator/check', async (c) => ((await isFacilitator(c)) ? c.body(null, 204) : c.json({ error: 'Facilitator key needed' }, 401)));

  // Everything the database holds, for the facilitator to download and keep as a backup.
  // Nothing personal is in it: voters are random ids made in the browser.
  app.get('/api/facilitator/export', async (c) => {
    if (!(await isFacilitator(c))) return c.json({ error: 'Facilitator key needed' }, 401);
    const table = (name: string, order: string) => db.query(`SELECT * FROM ${name} ORDER BY ${order}`);
    return c.json({
      exported_at: new Date().toISOString(),
      sessions: await table('sessions', 'code'),
      reactions: await table('reactions', 'session_code, prompt_id, voter'),
      reactions_archive: await table('reactions_archive', 'cleared_at, session_code, prompt_id, voter'),
      community_prompts: await table('community_prompts', 'id'),
      community_votes: await table('community_votes', 'prompt_id, voter'),
    });
  });

  // ---- Community prompts: one shared list for everyone, not tied to a session ----

  // `asker` is the anonymous id of the browser asking, if it said. Its own entries come back
  // marked `mine`, so the page can say so instead of offering a vote. Nobody else's id is sent.
  // Matt, 11 Nov 2026: nothing is listed until a facilitator has approved it. `approved`
  // false gives the ones still waiting, which only the facilitator page may ask for.
  async function communityList(asker = '', approved = true): Promise<CommunityItem[]> {
    const rows = await db.query<{ id: number; purpose: string; prompt: string; mine: boolean; kind: ReactionKind | null; n: string | number }>(
      `SELECT p.id, p.purpose, p.prompt, p.mine, v.kind, count(v.voter) AS n
       FROM (SELECT id, purpose, prompt, (voter = $1) AS mine FROM community_prompts WHERE NOT is_hidden AND is_approved = $2 ORDER BY id DESC LIMIT ${COMMUNITY_LIST_MAX * 2}) p
       LEFT JOIN community_votes v ON v.prompt_id = p.id
       GROUP BY p.id, p.purpose, p.prompt, p.mine, v.kind ORDER BY p.id DESC`, [asker, approved]);
    const items = new Map<number, CommunityItem>();
    for (const r of rows) {
      const item = items.get(r.id) ?? { id: r.id, purpose: r.purpose, prompt: r.prompt, points: 0, happy: 0, neutral: 0, sad: 0, ...(r.mine ? { mine: true } : {}) };
      items.set(r.id, item);
      if (r.kind) {
        item[r.kind] = Number(r.n);
        item.points += Number(r.n) * REACTION_POINTS[r.kind];
      }
    }
    // Best first, by the chart's own rule; among equals the newest first, so a fresh prompt gets seen.
    return sortByScore(Array.from(items.values()), (a, b) => b.id - a.id).slice(0, COMMUNITY_LIST_MAX);
  }

  app.get('/api/community', async (c) => {
    const asker = c.req.header('x-voter') ?? '';
    return c.json(await communityList(VOTER.test(asker) ? asker : ''));
  });

  // What has been sent in and is waiting for a yes or a no.
  app.get('/api/community/waiting', async (c) => {
    if (!(await isFacilitator(c))) return c.json({ error: 'Facilitator key needed' }, 401);
    return c.json(await communityList('', false));
  });

  app.post('/api/community/:id/approve', async (c) => {
    if (!(await isFacilitator(c))) return c.json({ error: 'Facilitator key needed' }, 401);
    if (!COMMUNITY_ID.test(c.req.param('id'))) return c.json({ error: 'No such prompt' }, 404);
    const rows = await db.query(
      'UPDATE community_prompts SET is_approved = true WHERE id = $1 AND NOT is_hidden RETURNING id', [Number(c.req.param('id'))]);
    return rows.length ? c.body(null, 204) : c.json({ error: 'No such prompt' }, 404);
  });

  app.post('/api/community', async (c) => {
    // The kill switch. A 503 reads as "server away" to the pages, which hold the entry quietly.
    if (options.communityOpen === false) return c.json({ error: 'Community prompts are paused.' }, 503);
    const body = await c.req.json().catch(() => null);
    const voter = body?.voter;
    const purpose = typeof body?.purpose === 'string' ? tidyPurpose(body.purpose) : '';
    const prompt = typeof body?.prompt === 'string' ? tidyPrompt(body.prompt) : '';
    if (typeof voter !== 'string' || !VOTER.test(voter)) return c.json({ error: 'Bad request' }, 400);
    const problem = shareProblem(purpose, prompt);
    if (problem) return c.json({ error: problem }, 400);
    // Sent twice (two tabs open, or a slow reply retried by the browser)? It is one entry.
    const already = await db.query<{ id: number }>(
      'SELECT id FROM community_prompts WHERE voter = $1 AND purpose = $2 AND prompt = $3 AND NOT is_hidden LIMIT 1',
      [voter, purpose, prompt]);
    if (already.length) return c.json({ id: already[0].id }, 200);
    const flood = limits.check(addressOf(c), voter);
    // 503 as for votes: the page holds the entry and sends it again, instead of saying thank
    // you and losing it. (The hourly limit on sharing, below, is still a refusal they are told about.)
    if (flood) return c.json({ error: flood }, 503);
    // Counted from the table, so a restart does not hand everyone a fresh allowance.
    const recent = await db.query<{ mine: string | number; everyone: string | number }>(
      `SELECT count(*) FILTER (WHERE voter = $1) AS mine, count(*) AS everyone
       FROM community_prompts WHERE created_at > now() - interval '1 hour'`, [voter]);
    if (Number(recent[0].mine) >= SHARES_PER_VOTER_PER_HOUR || Number(recent[0].everyone) >= SHARES_PER_HOUR) {
      return c.json({ error: 'That is plenty for now. Try again in a while.' }, 429);
    }
    const made = await db.query<{ id: number }>(
      'INSERT INTO community_prompts (purpose, prompt, voter) VALUES ($1, $2, $3) RETURNING id', [purpose, prompt, voter]);
    return c.json({ id: made[0].id }, 201);
  });

  // One face per person per community prompt; kind null takes it back.
  app.put('/api/community/:id/reactions', async (c) => {
    const body = await c.req.json().catch(() => null);
    const { voter, kind } = body ?? {};
    if (!COMMUNITY_ID.test(c.req.param('id')) || typeof voter !== 'string' || !VOTER.test(voter)
      || !(kind === null || REACTION_KINDS.includes(kind))) {
      return c.json({ error: 'That vote did not go through. Refresh the page and try again.' }, 400);
    }
    const id = Number(c.req.param('id'));
    const flood = limits.check(addressOf(c), voter);
    // 503, not 429: to the pages a 5xx means "hold this vote and send it again later".
    // A refusal would be thrown away, and a busy room must never cost anyone their vote.
    if (flood) return c.json({ error: flood }, 503);
    const found = await db.query<{ voter: string }>('SELECT voter FROM community_prompts WHERE id = $1 AND NOT is_hidden AND is_approved', [id]);
    if (!found.length) return c.json({ error: 'That prompt is no longer here' }, 404);
    // The chart is other people's verdict on it, so the person who shared it has no vote.
    if (kind !== null && found[0].voter === voter) return c.json({ error: "You can't vote on your own entry." }, 403);
    if (kind === null) {
      await db.query('DELETE FROM community_votes WHERE prompt_id = $1 AND voter = $2', [id, voter]);
    } else {
      await db.query(
        `INSERT INTO community_votes (prompt_id, voter, kind) VALUES ($1, $2, $3)
         ON CONFLICT (prompt_id, voter) DO UPDATE SET kind = EXCLUDED.kind, updated_at = now()`, [id, voter, kind]);
    }
    return c.body(null, 204);
  });

  // The facilitator's remedy for anything that should not be up. The entry leaves the list
  // and its words are wiped, so nothing personal that was typed stays in the database.
  const ERASE = "UPDATE community_prompts SET is_hidden = true, purpose = '[removed]', prompt = ''";

  app.delete('/api/community/:id', async (c) => {
    if (!(await isFacilitator(c))) return c.json({ error: 'Facilitator key needed' }, 401);
    if (!COMMUNITY_ID.test(c.req.param('id'))) return c.json({ error: 'No such prompt' }, 404);
    const rows = await db.query(`${ERASE} WHERE id = $1 AND NOT is_hidden RETURNING id`, [Number(c.req.param('id'))]);
    return rows.length ? c.body(null, 204) : c.json({ error: 'No such prompt' }, 404);
  });

  // For a flood: remove everything added in the last so-many minutes, in one go.
  app.post('/api/community/remove-recent', async (c) => {
    if (!(await isFacilitator(c))) return c.json({ error: 'Facilitator key needed' }, 401);
    const body = await c.req.json().catch(() => null);
    const minutes = Number(body?.minutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) return c.json({ error: 'Give minutes, 1 to 1440' }, 400);
    const rows = await db.query(
      `${ERASE} WHERE NOT is_hidden AND created_at > now() - ($1 || ' minutes')::interval RETURNING id`, [String(minutes)]);
    return c.json({ removed: rows.length });
  });

  app.post('/api/sessions', async (c) => {
    if (!(await isFacilitator(c))) return c.json({ error: 'Facilitator key needed' }, 401);
    const body = await c.req.json().catch(() => null);
    const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 80) : '';
    const promptIds: unknown = body?.promptIds;
    if (!name || !validPromptIds(promptIds)) {
      return c.json({ error: 'Give a name and 2 to 100 different prompt ids' }, 400);
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      let code = '';
      for (let i = 0; i < 4; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      const made = await db.query(
        'INSERT INTO sessions (code, name, prompt_ids) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING code',
        [code, name, promptIds]);
      if (made.length) return c.json({ code }, 201);
    }
    return c.json({ error: 'Could not make a session code, try again' }, 500);
  });

  app.get('/api/sessions/:code', async (c) => {
    const session = await getSession(c.req.param('code'));
    return session ? c.json(session) : c.json({ error: 'No session with that code' }, 404);
  });

  // Rename a session or change its prompts. Every attendee page and the projector follow.
  // Votes for a prompt taken out are kept, so putting it back restores them.
  app.patch('/api/sessions/:code', async (c) => {
    if (!(await isFacilitator(c))) return c.json({ error: 'Facilitator key needed' }, 401);
    const body = await c.req.json().catch(() => null);
    const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 80) : '';
    const promptIds = body?.promptIds === undefined ? null : body.promptIds;
    if ((!name && promptIds === null) || (promptIds !== null && !validPromptIds(promptIds))) {
      return c.json({ error: 'Give a name, or 2 to 100 different prompt ids' }, 400);
    }
    const rows = await db.query<SessionRow>(
      `UPDATE sessions SET name = COALESCE($1, name), prompt_ids = COALESCE($2, prompt_ids)
       WHERE code = $3 RETURNING *`, [name || null, promptIds, c.req.param('code').toUpperCase()]);
    if (!rows.length) return c.json({ error: 'No session with that code' }, 404);
    const session = toInfo(rows[0]);
    await broadcast(session);
    return c.json(session);
  });

  // Clear a session's votes: all of them, or only those from the last so-many minutes
  // (for undoing a burst of fake ones without losing the room's real votes). Cleared votes
  // leave the chart but are never destroyed (Matt, 11 Nov 2026: "this data is important"):
  // they move to reactions_archive in the same statement, and the backup download has them.
  app.post('/api/sessions/:code/clear-votes', async (c) => {
    if (!(await isFacilitator(c))) return c.json({ error: 'Facilitator key needed' }, 401);
    const session = await getSession(c.req.param('code'));
    if (!session) return c.json({ error: 'No session with that code' }, 404);
    const body = await c.req.json().catch(() => null);
    const minutes = body?.minutes === undefined ? null : Number(body.minutes);
    if (minutes !== null && (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440)) {
      return c.json({ error: 'Give minutes, 1 to 1440, or nothing to clear all' }, 400);
    }
    const ARCHIVE = `INSERT INTO reactions_archive (session_code, voter, prompt_id, kind, updated_at)
      SELECT session_code, voter, prompt_id, kind, updated_at FROM gone RETURNING 1`;
    const rows = minutes === null
      ? await db.query(`WITH gone AS (DELETE FROM reactions WHERE session_code = $1 RETURNING *) ${ARCHIVE}`, [session.code])
      : await db.query(
        `WITH gone AS (DELETE FROM reactions WHERE session_code = $1 AND updated_at > now() - ($2 || ' minutes')::interval RETURNING *) ${ARCHIVE}`,
        [session.code, String(minutes)]);
    await broadcast(session);
    return c.json({ cleared: rows.length });
  });

  app.get('/api/sessions/:code/board', async (c) => {
    const session = await getSession(c.req.param('code'));
    return session ? c.json(await getBoard(session)) : c.json({ error: 'No session with that code' }, 404);
  });

  // This browser's own votes in a session, so a vote cast on one page (the swipe sprint
  // or the try-it page) shows as cast on the other. The id travels in a header, not the address.
  app.get('/api/sessions/:code/mine', async (c) => {
    const session = await getSession(c.req.param('code'));
    if (!session) return c.json({ error: 'No session with that code' }, 404);
    const voter = c.req.header('x-voter') ?? '';
    if (!VOTER.test(voter)) return c.json({ error: 'Bad request' }, 400);
    const rows = await db.query<{ prompt_id: string; kind: ReactionKind }>(
      'SELECT prompt_id, kind FROM reactions WHERE session_code = $1 AND voter = $2', [session.code, voter]);
    const mine: Record<string, ReactionKind> = {};
    for (const r of rows) mine[r.prompt_id] = r.kind;
    return c.json(mine);
  });

  // One reaction per voter per prompt. Sending it again changes it; kind null removes it.
  app.put('/api/sessions/:code/reactions', async (c) => {
    const session = await getSession(c.req.param('code'));
    if (!session) return c.json({ error: 'No session with that code' }, 404);
    if (!session.open) return c.json({ error: 'Voting is closed' }, 409);
    const body = await c.req.json().catch(() => null);
    const { voter, promptId, kind } = body ?? {};
    if (typeof voter !== 'string' || !VOTER.test(voter) || !session.promptIds.includes(promptId)
      || !(kind === null || REACTION_KINDS.includes(kind))) {
      return c.json({ error: 'That vote did not go through. Refresh the page and try again.' }, 400);
    }
    const flood = limits.check(addressOf(c), voter);
    // 503, not 429: to the pages a 5xx means "hold this vote and send it again later".
    // A refusal would be thrown away, and a busy room must never cost anyone their vote.
    if (flood) return c.json({ error: flood }, 503);
    if (kind === null) {
      await db.query('DELETE FROM reactions WHERE session_code = $1 AND voter = $2 AND prompt_id = $3',
        [session.code, voter, promptId]);
    } else {
      await db.query(
        `INSERT INTO reactions (session_code, voter, prompt_id, kind) VALUES ($1, $2, $3, $4)
         ON CONFLICT (session_code, voter, prompt_id) DO UPDATE SET kind = EXCLUDED.kind, updated_at = now()`,
        [session.code, voter, promptId, kind]);
    }
    await broadcast(session);
    return c.body(null, 204);
  });

  // Live board. Browsers that cannot hold this open fall back to polling /board.
  app.get('/api/sessions/:code/stream', async (c) => {
    const session = await getSession(c.req.param('code'));
    if (!session) return c.json({ error: 'No session with that code' }, 404);
    const subs = listeners.get(session.code) ?? new Set();
    listeners.set(session.code, subs);
    // Too many streams is a flood, not a workshop. The page falls back to asking every 1.5 seconds.
    if (subs.size >= STREAMS_PER_SESSION || streams >= STREAMS_IN_ALL) return c.json({ error: 'Busy' }, 503);
    c.header('X-Accel-Buffering', 'no');
    return streamSSE(c, async (stream) => {
      let alive = true;
      const send = (board: Board) => {
        stream.writeSSE({ event: 'board', data: JSON.stringify(board) }).catch(() => { alive = false; });
      };
      subs.add(send);
      streams += 1;
      stream.onAbort(() => { alive = false; });
      try {
        send(await getBoard(session));
        while (alive) {
          await stream.sleep(20000);
          if (alive) await stream.writeSSE({ event: 'ping', data: '' }).catch(() => { alive = false; });
        }
      } finally { // however the stream ends, including a database error, the listener goes
        subs.delete(send);
        streams -= 1;
      }
    });
  });

  return app;
}

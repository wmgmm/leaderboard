import { beforeAll, describe, expect, it } from 'vitest';
import { createApp, ensureOpenSession } from '../server/app';
import { openDb } from '../server/db';
import type { Board } from '../shared/types';

const KEY = 'test-key';
let app: ReturnType<typeof createApp>;
let code: string;

const json = (method: string, body: unknown, headers: Record<string, string> = {}) => ({
  method, body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers },
});
const react = (voter: string, promptId: string, kind: string | null) =>
  app.request(`/api/sessions/${code}/reactions`, json('PUT', { voter, promptId, kind }));
const board = async () => (await (await app.request(`/api/sessions/${code}/board`)).json()) as Board;

beforeAll(async () => {
  app = createApp(await openDb(), KEY);
  const res = await app.request('/api/sessions',
    json('POST', { name: 'Test room', promptIds: ['p01', 'p02', 'p03'] }, { 'x-facilitator-key': KEY }));
  expect(res.status).toBe(201);
  code = (await res.json()).code;
});

describe('sessions', () => {
  it('needs the facilitator key to create one', async () => {
    const res = await app.request('/api/sessions', json('POST', { name: 'x', promptIds: ['p01', 'p02'] }));
    expect(res.status).toBe(401);
  });
  it('finds a session whatever the case of the code', async () => {
    const res = await app.request(`/api/sessions/${code.toLowerCase()}`);
    expect(await res.json()).toMatchObject({ code, name: 'Test room', open: true });
  });
  it('lets the facilitator rename it, and nobody else', async () => {
    const path = `/api/sessions/${code}`;
    expect((await app.request(path, json('PATCH', { name: 'Sneaky' }))).status).toBe(401);
    const res = await app.request(path, json('PATCH', { name: ' Experiment and Share ' }, { 'x-facilitator-key': KEY }));
    expect(await res.json()).toMatchObject({ code, name: 'Experiment and Share' });
    expect((await app.request(path, json('PATCH', { name: 'Test room' }, { 'x-facilitator-key': KEY }))).status).toBe(200);
  });
  it('lets the facilitator change the prompts, keeping the name', async () => {
    const path = `/api/sessions/${code}`;
    const res = await app.request(path, json('PATCH', { promptIds: ['p01', 'p02', 'p03', 'x01'] }, { 'x-facilitator-key': KEY }));
    expect(await res.json()).toMatchObject({ name: 'Test room', promptIds: ['p01', 'p02', 'p03', 'x01'] });
    expect((await app.request(path, json('PATCH', { promptIds: ['p01', 'p01'] }, { 'x-facilitator-key': KEY }))).status).toBe(400);
  });
  it('404s an unknown code', async () => {
    expect((await app.request('/api/sessions/ZZZZ')).status).toBe(404);
  });
});

describe('the standing session for people with no room code', () => {
  it('exists after start-up, takes votes, and follows the prompt list on the next start', async () => {
    const db = await openDb();
    await ensureOpenSession(db, ['p01', 'p02']);
    const open = createApp(db, KEY);
    const vote = (promptId: string) => open.request('/api/sessions/OPEN/reactions', json('PUT', { voter: 'voter-open1', promptId, kind: 'happy' }));
    expect((await vote('p02')).status).toBe(204);
    expect((await vote('x01')).status).toBe(400); // not in the list yet
    await ensureOpenSession(db, ['p01', 'p02', 'x01']);
    expect((await vote('x01')).status).toBe(204);
    const board = (await (await open.request('/api/sessions/open/board')).json()) as Board;
    expect(board.rows.map((r) => [r.id, r.happy])).toEqual([['p02', 1], ['x01', 1], ['p01', 0]]);
  });
  it('counts one vote per person per prompt, whichever page it came from', async () => {
    const db = await openDb();
    await ensureOpenSession(db, ['p01', 'p02']);
    const open = createApp(db, KEY);
    const vote = (kind: string) => open.request('/api/sessions/OPEN/reactions', json('PUT', { voter: 'voter-same1', promptId: 'p01', kind }));
    await vote('happy'); // from the swipe sprint
    await vote('sad');   // then changed on the try-it page: same browser id, so it replaces
    const board = (await (await open.request('/api/sessions/OPEN/board')).json()) as Board;
    expect(board.voters).toBe(1);
    expect(board.rows.find((r) => r.id === 'p01')).toMatchObject({ happy: 0, sad: 1 });
    // Either page can ask what this browser has already said.
    const mine = await open.request('/api/sessions/OPEN/mine', { headers: { 'x-voter': 'voter-same1' } });
    expect(await mine.json()).toEqual({ p01: 'sad' });
    const other = await open.request('/api/sessions/OPEN/mine', { headers: { 'x-voter': 'voter-other' } });
    expect(await other.json()).toEqual({});
    expect((await open.request('/api/sessions/OPEN/mine')).status).toBe(400);
  });
});

describe('reactions', () => {
  it('counts one vote per voter per prompt, and lets them change it', async () => {
    expect((await react('voter-aaaa', 'p02', 'neutral')).status).toBe(204);
    expect((await react('voter-aaaa', 'p02', 'happy')).status).toBe(204);
    expect((await react('voter-bbbb', 'p02', 'neutral')).status).toBe(204);
    const b = await board();
    expect(b.voters).toBe(2);
    expect(b.rows[0]).toMatchObject({ id: 'p02', rank: 1, points: 3, happy: 1, neutral: 1, recent: 2 });
  });
  it('removes a vote when kind is null', async () => {
    await react('voter-bbbb', 'p02', null);
    expect((await board()).rows[0]).toMatchObject({ id: 'p02', points: 2, neutral: 0 });
  });
  it('rejects prompts outside the session and unknown kinds', async () => {
    expect((await react('voter-aaaa', 'p09', 'happy')).status).toBe(400);
    expect((await react('voter-aaaa', 'p01', 'love')).status).toBe(400);
    expect((await react('x', 'p01', 'happy')).status).toBe(400);
  });
});

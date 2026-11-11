import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../server/app';
import { openDb } from '../server/db';
import type { CommunityItem } from '../shared/types';

const KEY = 'test-key';
let app: ReturnType<typeof createApp>;

const json = (method: string, body: unknown, headers: Record<string, string> = {}) => ({
  method, body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers },
});
const share = (voter: string, purpose: string, prompt?: string) =>
  app.request('/api/community', json('POST', { voter, purpose, prompt }));
const react = (id: number, voter: string, kind: string | null) =>
  app.request(`/api/community/${id}/reactions`, json('PUT', { voter, kind }));
const list = async () => (await (await app.request('/api/community')).json()) as CommunityItem[];

beforeAll(async () => { app = createApp(await openDb(), KEY); });

describe('community prompts', () => {
  it('publishes a prompt straight away, and the prompt text is optional', async () => {
    expect((await share('voter-aaaa', '  Tidying   meeting notes ', 'Turn these notes into actions: [notes]')).status).toBe(201);
    expect((await share('voter-bbbb', 'Planning my week')).status).toBe(201);
    const items = await list();
    expect(items.map((i) => [i.purpose, i.prompt])).toEqual([
      ['Planning my week', ''], ['Tidying meeting notes', 'Turn these notes into actions: [notes]']]);
  });

  it('treats the same suggestion sent twice as one entry', async () => {
    const before = (await list()).length;
    const again = await share('voter-bbbb', 'Planning my week');
    expect(again.status).toBe(200);
    expect((await list()).length).toBe(before);
  });

  it('needs a purpose and refuses text that is too long', async () => {
    expect((await share('voter-aaaa', 'x')).status).toBe(400);
    expect((await share('voter-aaaa', 'y'.repeat(121))).status).toBe(400);
    expect((await share('voter-aaaa', 'Fine purpose', 'z'.repeat(1501))).status).toBe(400);
  });

  it('refuses email addresses and phone numbers, since everyone can see it', async () => {
    const email = await share('voter-aaaa', 'Emailing sam@example.com about leave');
    expect(email.status).toBe(400);
    expect((await email.json()).error).toMatch(/email address/);
    expect((await share('voter-aaaa', 'Chasing a supplier', 'Call 029 2018 0123 and ask')).status).toBe(400);
    expect((await share('voter-aaaa', 'Budgeting', 'Split £1,200 across 12 months')).status).toBe(201);
  });

  it('ranks by votes, one changeable face per person', async () => {
    const week = (await list()).find((i) => i.purpose === 'Planning my week')!;
    const notes = (await list()).find((i) => i.purpose === 'Tidying meeting notes')!;
    await react(notes.id, 'voter-cccc', 'neutral');
    await react(notes.id, 'voter-cccc', 'happy');
    await react(notes.id, 'voter-dddd', 'happy');
    await react(week.id, 'voter-cccc', 'sad');
    const items = await list();
    expect(items[0]).toMatchObject({ purpose: 'Tidying meeting notes', points: 4, happy: 2, neutral: 0 });
    expect(items.find((i) => i.id === week.id)).toMatchObject({ points: 0, sad: 1 });
    await react(notes.id, 'voter-dddd', null);
    expect((await list())[0]).toMatchObject({ points: 2, happy: 1 });
  });

  it('lets only the facilitator hide a prompt, and a hidden one cannot be voted on', async () => {
    const week = (await list()).find((i) => i.purpose === 'Planning my week')!;
    expect((await app.request(`/api/community/${week.id}`, { method: 'DELETE' })).status).toBe(401);
    expect((await app.request(`/api/community/${week.id}`, { method: 'DELETE', headers: { 'x-facilitator-key': KEY } })).status).toBe(204);
    expect((await list()).some((i) => i.id === week.id)).toBe(false);
    expect((await react(week.id, 'voter-eeee', 'happy')).status).toBe(404);
  });

  it('stops one person flooding the list', async () => {
    for (let i = 0; i < 5; i++) expect((await share('voter-flood', `Idea number ${'abcde'[i]}`)).status).toBe(201);
    expect((await share('voter-flood', 'One too many')).status).toBe(429);
    expect((await share('voter-other', 'Someone else is fine')).status).toBe(201);
  });
});

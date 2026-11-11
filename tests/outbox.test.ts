import { beforeEach, describe, expect, it, vi } from 'vitest';

// The browser side of voting, run here against stand-ins for the browser: a fake
// localStorage and a fake vote server that can be switched off.
const store = new Map<string, string>();
let serverUp = true;
let slow = 0;
let failNext = 0; // this many requests get no reply, then the server is back
const received: string[] = []; // what reached the server, in order

vi.stubGlobal('location', { hostname: 'localhost' });
vi.stubGlobal('window', globalThis);
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
});
vi.stubGlobal('fetch', async (url: string, init?: { body?: string }) => {
  if (slow) await new Promise((r) => setTimeout(r, slow));
  if (!serverUp || failNext-- > 0) throw new TypeError('network down');
  const body = init?.body ? JSON.parse(init.body) : {};
  received.push(`${url.replace(/^.*\/api\//, '')} ${body.kind ?? body.purpose ?? ''}`.trim());
  return new Response(null, { status: 204 });
});

const { deliver, flushOutbox, waitingVotes } = await import('../shared/client');
const outbox = () => JSON.parse(store.get('totp-outbox') || '[]') as { kind?: string }[];
const vote = (kind: 'happy' | 'neutral' | 'sad') => ({ t: 'vote' as const, code: 'OPEN', id: 'p01', kind });

beforeEach(() => { store.clear(); received.length = 0; serverUp = true; slow = 0; failNext = 0; });

describe('the outbox', () => {
  it('holds a vote while the server is away, says nothing, and sends it when it is back', async () => {
    serverUp = false;
    expect(await deliver(vote('happy'))).toBe('');
    expect(outbox()).toHaveLength(1);
    expect(waitingVotes('OPEN')).toEqual({ p01: 'happy' });
    serverUp = true;
    await flushOutbox();
    expect(received).toEqual(['sessions/OPEN/reactions happy']);
    expect(outbox()).toEqual([]);
  });

  it('never lets an older queued vote overwrite a newer one', async () => {
    serverUp = false;
    await deliver(vote('happy')); // queued
    serverUp = true;
    await deliver(vote('sad')); // the person changes their mind before the next flush
    await flushOutbox();
    expect(received).toEqual(['sessions/OPEN/reactions sad']); // happy was dropped, not sent late
    expect(outbox()).toEqual([]);
  });

  it('saves a vote before sending it, so closing the tab mid-send cannot lose it', async () => {
    slow = 20;
    const sending = deliver(vote('happy'));
    expect(outbox()).toHaveLength(1); // on disk while the request is still in the air
    await sending;
    expect(received).toEqual(['sessions/OPEN/reactions happy']);
    expect(outbox()).toEqual([]);
  });

  it('never lets a first vote that failed come back over a second that got through', async () => {
    slow = 5;
    failNext = 1; // the first request is lost in a blip
    const first = deliver(vote('happy'));
    const second = deliver(vote('sad'));
    await Promise.all([first, second]);
    await flushOutbox();
    expect(received).toEqual(['sessions/OPEN/reactions sad']);
    expect(outbox()).toEqual([]);
  });

  it('sends two quick votes on one prompt in the order they were cast', async () => {
    slow = 20;
    const first = deliver(vote('happy'));
    slow = 1; // the second request would overtake the first if they ran side by side
    const second = deliver(vote('neutral'));
    await Promise.all([first, second]);
    expect(received).toEqual(['sessions/OPEN/reactions happy', 'sessions/OPEN/reactions neutral']);
  });

  it('keeps everything, in order, if the server is still away at the next try', async () => {
    serverUp = false;
    await deliver(vote('happy'));
    await deliver({ t: 'share', purpose: 'Tidying notes', prompt: '' });
    await flushOutbox();
    expect(outbox()).toHaveLength(2);
    serverUp = true;
    await flushOutbox();
    expect(received).toEqual(['sessions/OPEN/reactions happy', 'community Tidying notes']);
  });

  it('does not send a job another tab has already dealt with', async () => {
    serverUp = false;
    await deliver(vote('happy'));
    await deliver({ t: 'share', purpose: 'Tidying notes', prompt: '' });
    serverUp = true;
    slow = 15;
    const flushing = flushOutbox();
    // While the first job is in flight, the other tab finishes the second and removes it.
    store.set('totp-outbox', JSON.stringify(outbox().slice(0, 1)));
    await flushing;
    expect(received).toEqual(['sessions/OPEN/reactions happy']);
  });
});

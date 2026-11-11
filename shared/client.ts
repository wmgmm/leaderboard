// Everything the browser pages say to the vote server. Shared by the try-it page
// (web/) and the swipe sprint (sprint/), so one person is one voter on both.
import type { Board, CommunityItem, ReactionKind, SessionInfo } from './types';

// Locally the server also serves the pages, so the API is the same address.
// On GitHub Pages the API lives on Railway.
const RAILWAY_API = 'https://leaderboard-production-efc043b4.up.railway.app'; // the vote server on Railway
const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
export const API = LOCAL ? '' : RAILWAY_API;

/** Anonymous id for this browser. No name, no account; it only stops double votes. */
let knownVoter: string | null = null;
export function voterId(): string {
  if (knownVoter) return knownVoter;
  const KEY = 'totp-voter';
  let id: string | null = null;
  try { id = localStorage.getItem(KEY); } catch { /* storage blocked */ }
  if (!id) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    id = Array.from(bytes, (b) => ('0' + b.toString(16)).slice(-2)).join('');
    try { localStorage.setItem(KEY, id); } catch { /* kept in memory for this visit instead */ }
  }
  knownVoter = id;
  return id;
}

/**
 * The vote server is not there: no network, no reply in time, or something else
 * answering in its place. Different from the server saying no, which is an Error
 * with words for the person. The pages carry on quietly when they see this.
 */
export class Offline extends Error {}

// A request that never comes back must not leave the page waiting.
const REPLY_LIMIT_MS = 8000;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const abort = 'AbortController' in window ? new AbortController() : null;
  const timer = abort ? setTimeout(() => abort.abort(), REPLY_LIMIT_MS) : 0;
  let res: Response;
  try {
    res = await fetch(API + path, abort ? { ...init, signal: abort.signal } : init);
  } catch {
    throw new Offline('No reply from the server.');
  } finally {
    clearTimeout(timer);
  }
  if (res.ok) {
    if (res.status === 204) return undefined as T;
    try { return await res.json(); } catch { throw new Offline('Not the vote server.'); }
  }
  // Our server always explains a refusal as { error }. Anything else, or any 5xx, is an outage.
  const problem = await res.json().catch(() => null);
  if (res.status >= 500 || !problem || typeof problem.error !== 'string') throw new Offline(`Server unavailable (${res.status})`);
  throw new Error(problem.error);
}

export const getSession = (code: string) => request<SessionInfo>(`/api/sessions/${encodeURIComponent(code)}`);
export const getBoard = (code: string) => request<Board>(`/api/sessions/${encodeURIComponent(code)}/board`);

/** The votes this browser has already cast in a session, whichever page they came from. */
export const getMyVotes = (code: string) =>
  request<Record<string, ReactionKind>>(`/api/sessions/${encodeURIComponent(code)}/mine`, { headers: { 'x-voter': voterId() } });

export function sendReaction(code: string, promptId: string, kind: ReactionKind | null) {
  return request<void>(`/api/sessions/${encodeURIComponent(code)}/reactions`, {
    method: 'PUT',
    keepalive: true, // finished by the browser even if the page is closed or left
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ voter: voterId(), promptId, kind }),
  });
}

// The anonymous id goes along so the server can mark which entries are this browser's own.
export const getCommunity = () => request<CommunityItem[]>('/api/community', { headers: { 'x-voter': voterId() } });

export function shareCommunity(purpose: string, prompt: string) {
  return request<{ id: number }>('/api/community', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ voter: voterId(), purpose, prompt }),
  });
}

export function sendCommunityReaction(id: number, kind: ReactionKind | null) {
  return request<void>(`/api/community/${id}/reactions`, {
    method: 'PUT',
    keepalive: true, // finished by the browser even if the page is closed or left
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ voter: voterId(), kind }),
  });
}


// ---- The outbox: nothing a person does is lost, or even mentioned, if the server is down ----

export type Job =
  | { t: 'vote'; code: string; id: string; kind: ReactionKind | null }
  | { t: 'share'; purpose: string; prompt: string }
  | { t: 'cvote'; id: number; kind: ReactionKind | null };

const OUTBOX = 'totp-outbox';
const readOutbox = (): Job[] => {
  try { return JSON.parse(localStorage.getItem(OUTBOX) || '[]'); } catch { return []; }
};
const writeOutbox = (jobs: Job[]) => {
  try { localStorage.setItem(OUTBOX, JSON.stringify(jobs)); } catch { /* storage blocked: the job is lost with the tab */ }
};
const sameTarget = (a: Job, b: Job) =>
  (a.t === 'vote' && b.t === 'vote' && a.code === b.code && a.id === b.id)
  || (a.t === 'cvote' && b.t === 'cvote' && a.id === b.id);

function send(job: Job): Promise<unknown> {
  if (job.t === 'vote') return sendReaction(job.code, job.id, job.kind);
  if (job.t === 'cvote') return sendCommunityReaction(job.id, job.kind);
  return shareCommunity(job.purpose, job.prompt);
}

// Everything is sent one at a time, in the order it happened, so an older vote can
// never land after a newer one for the same prompt.
let line: Promise<unknown> = Promise.resolve();
const inTurn = <T>(work: () => Promise<T>): Promise<T> => {
  const next = line.then(work, work);
  line = next.catch(() => {});
  return next;
};

const same = (a: Job, b: Job) => JSON.stringify(a) === JSON.stringify(b);
const forget = (job: Job) => writeOutbox(readOutbox().filter((j) => !same(j, job)));

/**
 * Do it now if the server answers; if the server is not there, keep it for later.
 * Returns '' unless the server itself refused, in which case its reason. Never throws.
 */
export function deliver(job: Job): Promise<string> {
  // Saved before it is sent, and taken out only once the server has answered: a tab closed
  // while the request is in the air loses nothing, the next visit sends it. This is also
  // the latest word on its target, so it replaces anything older still waiting: a queued
  // "happy" must not be sent after this "sad".
  writeOutbox([...readOutbox().filter((j) => !sameTarget(j, job)), job]);
  return inTurn(async () => {
    try {
      await send(job);
    } catch (err) {
      // Server away: it stays saved, unless a newer vote has taken its place meanwhile.
      if (err instanceof Offline) return '';
      forget(job);
      return (err as Error).message;
    }
    forget(job);
    return '';
  });
}

/** Send whatever is waiting. Stops at the first sign the server is still away. */
export function flushOutbox(): Promise<void> {
  return inTurn(async () => {
    for (const job of readOutbox()) {
      // Another tab, or a newer vote, may have dealt with this one since the list was read.
      if (!readOutbox().some((j) => same(j, job))) continue;
      try {
        await send(job);
      } catch (err) {
        if (err instanceof Offline) return; // still away: keep this and the rest
        // refused for a reason of its own (voting closed, say): there is no point retrying
      }
      forget(job);
    }
  });
}

/** Votes for one session still waiting to be sent, so a page can show them as cast. */
export function waitingVotes(code: string): Record<string, ReactionKind | null> {
  const votes: Record<string, ReactionKind | null> = {};
  for (const job of readOutbox()) if (job.t === 'vote' && job.code === code) votes[job.id] = job.kind;
  return votes;
}

/** Call once per page: sends anything waiting now, every 30 seconds, and when the network returns. */
export function keepDelivering() {
  flushOutbox();
  setInterval(flushOutbox, 30000);
  window.addEventListener('online', flushOutbox);
}

import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { readFileSync } from 'node:fs';
import { createApp, ensureOpenSession } from './app';
import { openDb } from './db';

try { process.loadEnvFile(); } catch { /* no .env: Railway provides the variables */ }

// On Railway, refuse to start half-configured: without DATABASE_URL the votes would go to
// a throwaway local database and vanish at the next deploy, and without a real passphrase
// nobody could remove a community entry (or anyone could).
const key = process.env.FACILITATOR_KEY ?? '';
if (process.env.RAILWAY_ENVIRONMENT || process.env.DATABASE_URL) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set. Link the Postgres database to this service.');
  if (key.length < 20 || key === 'change-me') throw new Error('FACILITATOR_KEY must be set to a passphrase of 20 characters or more.');
}

// DATA_DIR is only for running a second local copy beside the first (each needs its own folder).
const db = await openDb(process.env.DATABASE_URL, process.env.DATA_DIR ?? '.data/pglite');
// Everyone without a room code votes in the standing session, on every ready prompt.
const prompts: { id: string; ready: boolean }[] = JSON.parse(readFileSync('web/prompts.json', 'utf8'));
await ensureOpenSession(db, prompts.filter((p) => p.ready).map((p) => p.id));
// COMMUNITY_SHARING=off pauses new community prompts without a redeploy of the code.
const app = createApp(db, key, { communityOpen: process.env.COMMUNITY_SHARING !== 'off' });
// The pages are also served from here, so a local run is one address.
app.use('/*', serveStatic({ root: './dist/web' }));

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => {
  console.log(`Top of the Prompts listening on ${port} (${process.env.DATABASE_URL ? 'Postgres' : 'PGlite'})`);
});

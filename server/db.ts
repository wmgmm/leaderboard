// One tiny query interface over two engines: real Postgres on Railway (DATABASE_URL),
// and PGlite (Postgres compiled to run in-process) for local runs and tests.

export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  code        text PRIMARY KEY,
  name        text NOT NULL,
  prompt_ids  text[] NOT NULL,
  is_open     boolean NOT NULL DEFAULT true,
  is_hidden   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS reactions (
  session_code text NOT NULL REFERENCES sessions(code) ON DELETE CASCADE,
  voter        text NOT NULL,
  prompt_id    text NOT NULL,
  kind         text NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_code, voter, prompt_id)
);
CREATE TABLE IF NOT EXISTS community_prompts (
  id         serial PRIMARY KEY,
  purpose    text NOT NULL,
  prompt     text NOT NULL DEFAULT '',
  voter      text NOT NULL,
  is_hidden  boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS community_votes (
  prompt_id  integer NOT NULL REFERENCES community_prompts(id) ON DELETE CASCADE,
  voter      text NOT NULL,
  kind       text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (prompt_id, voter)
);
ALTER TABLE community_prompts ADD COLUMN IF NOT EXISTS is_approved boolean NOT NULL DEFAULT false;
`;

export async function openDb(databaseUrl?: string, dataDir?: string): Promise<Db> {
  let db: Db;
  if (databaseUrl) {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({
      connectionString: databaseUrl, max: 5,
      connectionTimeoutMillis: 5000, // fail fast if the database is unreachable: browsers give up at 8 s
      statement_timeout: 5000,
    });
    // An idle connection dropping (a database restart) must not take the server down with it.
    pool.on('error', (err) => console.error('database connection lost:', err.message));
    db = {
      query: async (text, params) => (await pool.query(text, params as unknown[])).rows,
      close: () => pool.end(),
    };
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    const lite = new PGlite(dataDir); // undefined = in memory
    db = {
      query: async (text, params) => (await lite.query(text, params as unknown[])).rows as never[],
      close: () => lite.close(),
    };
  }
  for (const statement of SCHEMA.split(';')) {
    if (statement.trim()) await db.query(statement);
  }
  return db;
}

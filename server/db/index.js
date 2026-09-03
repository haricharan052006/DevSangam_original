const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// A pooled connection can be dropped by the server (Supabase's pooler
// recycles idle backends) between queries; without this handler that surfaces
// as an unhandled 'error' event on the Pool and crashes the process even
// though the pool itself recovers fine on the next query.
pool.on('error', (err) => {
  console.error('[db] unexpected error on idle Postgres client:', err.message);
});

// Column lists shared across routes/collab modules: the app's JSON contract
// and every existing query/render path is written against camelCase field
// names (passwordHash, roomCode, ownerId, coOwnerId, fileName, workspaceId,
// ...). Rather than propagate Postgres's snake_case convention out through
// the API and into the React client, every SELECT/RETURNING aliases columns
// back to those names — the storage engine changed, the contract didn't.
//
// `name` (the user's display name) needs no alias: it's the one column that
// already matches its JS field 1:1, and deliberately carries no UNIQUE
// constraint — identity/login runs on email, name is just what's shown.
const USER_COLUMNS = `
  id, name, email, password_hash AS "passwordHash",
  google_id AS "googleId", avatar_url AS "avatarUrl", created_at AS "createdAt"
`;

// workspaces.id IS the shareable room code (e.g. "DS-AB12-2026") — a VARCHAR
// primary key rather than a surrogate SERIAL, per the requested schema — so
// `id` is aliased a second time as "roomCode" for every call site that reads
// the two as conceptually distinct fields the way the old schema had them.
const WORKSPACE_COLUMNS = `
  id, id AS "roomCode", title AS name, description, owner_id AS "ownerId",
  co_owner_id AS "coOwnerId", language, settings, created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

const FILE_COLUMNS = `
  id, workspace_id AS "workspaceId", filename AS "fileName", path, content,
  language, updated_at AS "updatedAt"
`;

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    google_id VARCHAR(255) UNIQUE,
    avatar_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS workspaces (
    id VARCHAR(255) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    co_owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    language VARCHAR(50),
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS files (
    id SERIAL PRIMARY KEY,
    workspace_id VARCHAR(255) REFERENCES workspaces(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    path VARCHAR(255) NOT NULL,
    content TEXT DEFAULT '',
    language VARCHAR(50),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS workspace_members (
    id SERIAL PRIMARY KEY,
    workspace_id VARCHAR(255) REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'editor',
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`;

// Brings a users table predating the name/email identity model up to date:
// collapses the old full_name + username pair (username was the unique
// login handle) down to a single, non-unique `name` display field, since
// login now runs on email alone. Postgres can do both in place — no
// SQLite-style rebuild-into-a-temp-table needed here.
async function migrateUsersTable() {
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users'`
  );
  const columns = rows.map((r) => r.column_name);

  if (columns.includes('full_name') && !columns.includes('name')) {
    console.log('[db] migrating users table: full_name -> name');
    await pool.query('ALTER TABLE users RENAME COLUMN full_name TO name');
  }
  if (columns.includes('username')) {
    console.log('[db] migrating users table: dropping username (display names are no longer unique)');
    await pool.query('ALTER TABLE users DROP COLUMN username');
  }
}

// A member can only ever have one row per workspace — the "save to
// dashboard" endpoint relies on that via `ON CONFLICT (workspace_id,
// user_id) DO NOTHING` to make re-saving an already-saved workspace a
// harmless no-op instead of piling up duplicate rows. CREATE TABLE IF NOT
// EXISTS above won't retrofit this onto a table that already existed
// without it, so it's added the same way migrateUsersTable evolves `users`.
async function migrateWorkspaceMembersTable() {
  const { rows } = await pool.query(
    `SELECT 1 FROM pg_constraint WHERE conname = 'workspace_members_workspace_user_unique'`
  );
  if (rows.length > 0) return;

  console.log('[db] migrating workspace_members: enforcing one row per (workspace, user)');
  // Collapse any pre-existing duplicates first — ADD CONSTRAINT UNIQUE fails
  // outright if the table already violates it.
  await pool.query(`
    DELETE FROM workspace_members a USING workspace_members b
    WHERE a.id > b.id AND a.workspace_id = b.workspace_id AND a.user_id = b.user_id
  `);
  await pool.query(
    `ALTER TABLE workspace_members
       ADD CONSTRAINT workspace_members_workspace_user_unique UNIQUE (workspace_id, user_id)`
  );
}

// Cached so repeated requires (or an accidental second call) don't re-issue
// the schema DDL — call and await this once, from index.js at startup,
// before the HTTP server starts accepting requests.
let initPromise = null;
function initDb() {
  if (!initPromise) {
    initPromise = pool
      .query(SCHEMA_SQL)
      .then(() => migrateUsersTable())
      .then(() => migrateWorkspaceMembersTable())
      .then(() => {
        console.log('[db] schema ready (Postgres)');
      });
  }
  return initPromise;
}

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
  initDb,
  USER_COLUMNS,
  WORKSPACE_COLUMNS,
  FILE_COLUMNS,
};

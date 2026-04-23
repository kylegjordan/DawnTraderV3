/**
 * B65.1-HF3 (2026-04-23) — File-based DB Migration Runner
 *
 * Replaces `drizzle-kit push` for deployment-time migrations. Runs SQL files in
 * drizzle/migrations/ in lexicographic order, tracking applied names in a
 * `_migrations` ledger table so re-runs are idempotent.
 *
 * Why this exists: `drizzle-kit push` introspects the live DB and diffs against
 * shared/schema.ts to generate migration SQL. That introspector (kit v0.31.4)
 * can't parse PG ARRAY column defaults like `ARRAY['USD','USDT']::text[]` that
 * exist on several pre-existing columns (L221-223, 693, 726, 1331-1332, 2730,
 * 2812, 2855, 2937, 2959 in shared/schema.ts). It dies with
 * `SyntaxError: Unexpected token 'R', "RAY" is not valid JSON`. This has
 * blocked schema-driven migrations since B65.1.
 *
 * This runner side-steps introspection entirely. SQL files in
 * drizzle/migrations/ are the source of truth. The `_migrations` table records
 * which have been applied. Files whose names match the pattern
 * `<date>-<description>.sql` are applied once; rollback files (named
 * `<date>-<description>-rollback.sql` or containing "rollback" in the name) are
 * skipped automatically — they're for operator use only.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/db-migrate.ts
 *
 * Or via npm:
 *   npm run db:migrate
 *
 * The script exits 0 on success, non-zero on any failure. Each migration runs
 * inside its own transaction (the SQL files themselves use BEGIN/COMMIT).
 */

import fs from 'node:fs';
import path from 'node:path';
// Load DATABASE_URL from .env before using it — `npm run` does not auto-load
// .env, so the script does it itself. `dotenv` is already a project dependency.
import 'dotenv/config';
// `pg` is a CommonJS package; with ESM (type:module) we need the default import
// and destructure from it. Named imports fail with "does not provide an export".
import pg from 'pg';
const { Client } = pg;

const MIGRATIONS_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '..',
  'drizzle',
  'migrations',
);

async function ensureLedger(client: Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      checksum TEXT
    );
  `);
}

async function getAppliedMigrations(client: Client): Promise<Set<string>> {
  const { rows } = await client.query<{ name: string }>('SELECT name FROM _migrations');
  return new Set(rows.map((r) => r.name));
}

function listPendingMigrationFiles(applied: Set<string>): string[] {
  const all = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .filter((f) => !f.toLowerCase().includes('rollback'))
    .sort(); // lexicographic = date-prefixed chronological

  return all.filter((f) => !applied.has(f));
}

async function applyMigration(client: Client, filename: string): Promise<void> {
  const full = path.join(MIGRATIONS_DIR, filename);
  const sql = fs.readFileSync(full, 'utf-8');

  // The migration file is expected to contain its own BEGIN/COMMIT. We run it
  // as one statement so its transaction semantics are preserved. If the file
  // does not contain BEGIN/COMMIT (legacy migrations), this still works because
  // the pg client will implicitly commit on success.
  console.log(`[db-migrate] Applying: ${filename}`);
  try {
    await client.query(sql);
    await client.query('INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [
      filename,
    ]);
    console.log(`[db-migrate] ✓ ${filename}`);
  } catch (err) {
    console.error(`[db-migrate] ✗ ${filename}`);
    console.error(err);
    throw err;
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('[db-migrate] DATABASE_URL is not set');
    process.exit(2);
  }

  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.error(`[db-migrate] Migrations directory does not exist: ${MIGRATIONS_DIR}`);
    process.exit(2);
  }

  const client = new Client({ connectionString: url });
  try {
    await client.connect();
  } catch (err) {
    console.error('[db-migrate] Could not connect to database');
    console.error(err);
    process.exit(2);
  }

  try {
    await ensureLedger(client);
    const applied = await getAppliedMigrations(client);
    const pending = listPendingMigrationFiles(applied);

    if (pending.length === 0) {
      console.log('[db-migrate] No pending migrations. Database is up to date.');
      await client.end();
      return;
    }

    console.log(`[db-migrate] ${pending.length} pending migration(s):`);
    for (const name of pending) console.log(`  - ${name}`);

    for (const name of pending) {
      await applyMigration(client, name);
    }

    console.log(`[db-migrate] ✓ All ${pending.length} migrations applied successfully.`);
  } catch (err) {
    console.error('[db-migrate] Migration run failed');
    console.error(err);
    await client.end();
    process.exit(1);
  }

  await client.end();
}

main().catch((err) => {
  console.error('[db-migrate] Unexpected error:', err);
  process.exit(1);
});

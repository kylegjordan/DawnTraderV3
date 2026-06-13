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
import { fileURLToPath } from 'node:url';
// Load DATABASE_URL from .env before using it — `npm run` does not auto-load
// .env, so the script does it itself. `dotenv` is already a project dependency.
import 'dotenv/config';
// `pg` is a CommonJS package; with ESM (type:module) we need the default import
// and destructure from it. Named imports fail with "does not provide an export".
import pg from 'pg';
const { Client } = pg;

// P19-B1 (2026-06-13): fileURLToPath, NOT URL.pathname — pathname yields
// "/C:/..." on Windows, which path.resolve doubles into "C:\C:\...". Identical
// behavior on the Linux CI/staging runners; required for the bench runbook.
const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'drizzle',
  'migrations',
);

// B-NEW-43 Phase 2 chunk 3 (2026-05-23): MANIFEST.txt makes migration ordering
// explicit + auditable. Pre-B-NEW-43 the runner lex-sorted forward migrations,
// which produced wrong ordering for the b65 cluster (the b65-2-trailing-exit-seeds
// INSERT migration sorted before b65-create-module-constants CREATE TABLE).
// MANIFEST.txt is REQUIRED — no lex-sort fallback (Langston Step-2 design ACK
// constraint #1: silent fallback would silently mask exactly the regression
// we're fixing here).
const MANIFEST_PATH = path.join(MIGRATIONS_DIR, 'MANIFEST.txt');

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

/**
 * Read MANIFEST.txt — strip blank lines + `#` comments. Hard-fail if missing.
 */
function readManifest(): string[] {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(
      `[db-migrate] MANIFEST.txt is REQUIRED at ${MANIFEST_PATH} but missing. ` +
        'Migration ordering must be explicit (no silent lex-sort fallback — that ' +
        'would silently re-introduce the b65-2/b65-create-module-constants ordering ' +
        'regression B-NEW-43 Phase 2 chunk 3 fixed). Add MANIFEST.txt with one ' +
        'forward-migration filename per line.',
    );
  }
  return fs
    .readFileSync(MANIFEST_PATH, 'utf-8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

/**
 * Validate manifest matches filesystem: bijection between manifest lines and
 * non-rollback `*.sql` files in MIGRATIONS_DIR. Hard-fails on any drift
 * (Langston Step-2 design ACK constraint #2: developer-adds-migration-but-
 * forgets-MANIFEST is caught at PR-time by CI, not at staging-deploy time).
 */
function validateManifest(manifest: string[]): void {
  const manifestSet = new Set(manifest);
  if (manifestSet.size !== manifest.length) {
    const dupes = manifest.filter((f, i) => manifest.indexOf(f) !== i);
    throw new Error(
      `[db-migrate] MANIFEST.txt has duplicate entries: ${Array.from(new Set(dupes)).join(', ')}`,
    );
  }

  const fsForward = new Set(
    fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .filter((f) => !f.toLowerCase().includes('rollback')),
  );

  const inManifestRollback = manifest.filter((f) => f.toLowerCase().includes('rollback'));
  if (inManifestRollback.length > 0) {
    throw new Error(
      `[db-migrate] MANIFEST.txt contains rollback files (never legal here): ${inManifestRollback.join(', ')}`,
    );
  }

  const missingFromManifest: string[] = [];
  for (const f of fsForward) {
    if (!manifestSet.has(f)) missingFromManifest.push(f);
  }
  const missingFromFs: string[] = [];
  for (const f of manifest) {
    if (!fsForward.has(f)) missingFromFs.push(f);
  }

  if (missingFromManifest.length > 0 || missingFromFs.length > 0) {
    const msgs: string[] = [];
    if (missingFromManifest.length > 0) {
      msgs.push(
        `Files in drizzle/migrations/ NOT in MANIFEST.txt (forgot to add?): ${missingFromManifest.join(', ')}`,
      );
    }
    if (missingFromFs.length > 0) {
      msgs.push(
        `Lines in MANIFEST.txt NOT in drizzle/migrations/ (renamed/deleted file?): ${missingFromFs.join(', ')}`,
      );
    }
    throw new Error(`[db-migrate] MANIFEST.txt drift detected:\n  - ${msgs.join('\n  - ')}`);
  }
}

function listPendingMigrationFiles(applied: Set<string>): string[] {
  const manifest = readManifest();
  validateManifest(manifest);
  return manifest.filter((f) => !applied.has(f));
}

// B-NEW-43 Phase 2 chunk 4.5 (2026-05-23): some legacy data-migration files
// (notably the B-NEW-35 Phase 1 dedup migrations) contain VACUUM and DO $$
// blocks with embedded COMMIT — patterns that REQUIRE top-level execution
// outside any transaction. node-postgres `client.query(multiStmtSql)` cannot
// satisfy that (the simple-query batch wraps everything implicitly). On
// staging these files were applied via psql -f then manually recorded in
// _migrations. On a fresh CI Postgres there's no data to dedup anyway —
// they're effectively no-ops.
//
// To bridge this: a `-- db-migrate:skip` header marker tells this runner
// to INSERT the ledger row for the file but NOT execute the SQL. Use ONLY
// for files that are (a) already applied on staging via an external path
// AND (b) no-op on fresh empty PG.
const SKIP_MARKER = /^--\s*db-migrate:skip\b/m;

async function applyMigration(client: Client, filename: string): Promise<void> {
  const full = path.join(MIGRATIONS_DIR, filename);
  const sql = fs.readFileSync(full, 'utf-8');

  // Detect skip-marker (see SKIP_MARKER comment above).
  if (SKIP_MARKER.test(sql)) {
    console.log(`[db-migrate] ⊘ ${filename} (skip-marker present — ledger-only)`);
    await client.query('INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [
      filename,
    ]);
    return;
  }

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

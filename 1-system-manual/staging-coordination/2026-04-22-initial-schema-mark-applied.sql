-- ═════════════════════════════════════════════════════════════════════════════
-- B-NEW-43 Phase 2 chunk 4 (2026-05-23): Staging coordination — mark the new
-- 2026-04-22-initial-schema.sql migration as ALREADY APPLIED on staging.
--
-- Why this exists:
--   Phase 2 chunk 4 introduced `drizzle/migrations/2026-04-22-initial-schema.sql`
--   — a pg_dump of the schema state that existed on staging Supabase before
--   B65.1-HF3 (2026-04-23) introduced the file-based db-migrate.ts runner.
--   That dump was previously implicit (created by `drizzle-kit push` at
--   staging bootstrap time). It has now been promoted to a named, tracked
--   migration so a fresh CI/dev Postgres can build the same state top-to-bottom.
--
--   On STAGING the schema already exists. If the next staging `db:migrate` run
--   tries to apply 2026-04-22-initial-schema.sql, it will fail with
--   "type already exists" / "table already exists" — and the apply is wrapped
--   in a transaction, so the entire batch rolls back. To prevent that, we
--   INSERT a `_migrations` ledger row recording that this migration is
--   already applied, BEFORE the next staging deploy that pulls the new
--   MANIFEST.txt.
--
-- How to run:
--   On staging, BEFORE `git pull` brings in the new MANIFEST.txt and
--   2026-04-22-initial-schema.sql files:
--
--     ssh root@188.245.193.8
--     su - deploy -c 'cd /home/deploy/dawntrader && export $(grep DATABASE_URL .env) && psql "$DATABASE_URL" -f 1-system-manual/staging-coordination/2026-04-22-initial-schema-mark-applied.sql'
--
--   (Or `git pull` first, then run the SQL before `npm run db:migrate`.)
--
-- Idempotency:
--   The INSERT uses ON CONFLICT DO NOTHING. Safe to re-run; safe to run after
--   the file already exists in the ledger (no-op).
--
-- Future bootstrap scenarios (not staging-specific):
--   Any time a Postgres database is BOOTSTRAPPED FROM A STAGING DUMP (rather
--   than built fresh-empty from migrations), this script must also be run
--   before that database's first db:migrate. See SYSTEM_MANUAL.md "DB
--   bootstrap (B-NEW-43 Phase 2 chunk 4)" for the bootstrap-from-dump-vs-
--   fresh-empty-PG branch.
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Confirm the _migrations ledger table exists (it should — db-migrate.ts has
-- been running on staging since B65.1-HF3).
CREATE TABLE IF NOT EXISTS _migrations (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checksum TEXT
);

-- Mark the initial-schema migration as applied at its conceptual creation date
-- (2026-04-22, the day BEFORE B65.1-HF3 / 2026-04-23 introduced the file-based
-- runner). The exact timestamp does not matter for ledger semantics — only the
-- name is checked by listPendingMigrationFiles() in scripts/db-migrate.ts.
INSERT INTO _migrations (name, applied_at)
VALUES ('2026-04-22-initial-schema.sql', '2026-04-22T00:00:00+00:00')
ON CONFLICT (name) DO NOTHING;

-- Verify the insert worked (or was a no-op because it was already there).
SELECT name, applied_at
FROM _migrations
WHERE name = '2026-04-22-initial-schema.sql';

COMMIT;

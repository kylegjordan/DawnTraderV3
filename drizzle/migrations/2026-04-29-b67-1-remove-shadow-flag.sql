-- db-migrate:skip
-- B-NEW-43 Phase 2 chunk 4.7 (2026-05-23): bulk skip-marker added. This
-- migration's effects are already captured in 2026-04-22-initial-schema.sql
-- (pg_dump of staging state on 2026-05-23). On a fresh empty Postgres,
-- initial-schema applies the FINAL state; re-running this delta would
-- duplicate-create or otherwise conflict (idempotent ALTER-IF-NOT-EXISTS
-- migrations would no-op but still run unnecessarily; non-idempotent ones
-- would error). Skip-marker ledger-records as applied without running the
-- SQL. See scripts/db-migrate.ts SKIP_MARKER + 1-system-manual/staging-
-- coordination/2026-04-22-initial-schema-mark-applied.sql for the full
-- staging-vs-CI bootstrap divergence model.
-- B67.1 Follow-up — Remove shadow-mode flag (Kyle directive 2026-04-29: no fallbacks, no shadow theater)
--
-- The original B67.1 migration seeded `b67_1_enabled` (bool, default false) as
-- a feature flag for shadow-mode ship. Per Kyle directive 2026-04-29, we are
-- removing this flag entirely:
--
--   - No shadow theater — modifier is always computed and always applied
--   - No conditional null path in MCE refresh — modifier is always non-null
--   - Kill-switch use case (need to disable B67.1 operationally without code
--     redeploy) is now handled by setting modifier_min = modifier_max = 1.0
--     in the DB. Math produces identity, no special code path.
--
-- The code change in this commit removes all references to b67_1_enabled.
-- This migration just deletes the now-orphaned row.
--
-- Rollback: 2026-04-29-b67-1-restore-shadow-flag.sql

BEGIN;

DELETE FROM module_constants
WHERE module_name = 'macro_modifier'
  AND constant_name = 'b67_1_enabled';

COMMIT;

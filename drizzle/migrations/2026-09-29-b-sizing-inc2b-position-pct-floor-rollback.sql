-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK for 2026-09-29-b-sizing-inc2b-position-pct-floor.sql
-- B-SIZING-DEC-RESTORE increment 2b (G1, #698). NOT listed in MANIFEST.txt (rollbacks never are).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Restores increment 1's form of the constraint, 0 < max_position_percent_pct <= 100.
-- Independent of 2a's rollback (this touches no column 2a's rollback recreates).
-- ⚠️ With 2a deployed and this rolled back, p = 0.5 is again accepted and derives 200 positions (§14.4 D4).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE guardrails_v2 DROP CONSTRAINT guardrails_v2_max_position_percent_pct_range;

ALTER TABLE guardrails_v2
  ADD CONSTRAINT guardrails_v2_max_position_percent_pct_range
  CHECK (max_position_percent_pct > 0 AND max_position_percent_pct <= 100);

-- The forward file's `_migrations` row goes with it (column `name`, scripts/db-migrate.ts), so a later redeploy of the
-- batch applies the forward file again instead of skipping it over a restored schema (Step-4 fresh-reader round, 2026-09-29).
DELETE FROM _migrations WHERE name = '2026-09-29-b-sizing-inc2b-position-pct-floor.sql';

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK for 2026-09-29-b-sizing-inc3-paper-size-band.sql
-- B-SIZING-DEC-RESTORE increment 3 (P4, #698). NOT listed in MANIFEST.txt (rollbacks never are).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Removes the three paper_size_band rows. ⛔ ROLL THE CODE BACK FIRST: increment 3's server refuses to boot without
-- these rows (server/index.ts, by design — §16.4 C1).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DELETE FROM module_constants
 WHERE module_name = 'paper_size_band'
   AND constant_name IN ('low', 'high', 'target');

-- The forward file's `_migrations` row goes with it (column `name`, scripts/db-migrate.ts), so a later redeploy of the
-- batch applies the forward file again instead of skipping it over a restored schema (Step-4 fresh-reader round, 2026-09-29).
DELETE FROM _migrations WHERE name = '2026-09-29-b-sizing-inc3-paper-size-band.sql';

COMMIT;

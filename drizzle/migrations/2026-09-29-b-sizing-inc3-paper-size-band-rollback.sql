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

COMMIT;

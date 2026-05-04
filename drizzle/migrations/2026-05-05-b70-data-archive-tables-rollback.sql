-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-05-05 — B70 Data Archive Pipeline ROLLBACK
-- ═══════════════════════════════════════════════════════════════════════════
-- Drops the 5 B70 tables (and their auto-managed partitions via CASCADE) plus
-- removes the data_archive module_constants rows.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DROP TABLE IF EXISTS pair_scan_archive       CASCADE;
DROP TABLE IF EXISTS signal_eval_archive     CASCADE;
DROP TABLE IF EXISTS exit_decision_archive   CASCADE;
DROP TABLE IF EXISTS macro_feed_archive      CASCADE;
DROP TABLE IF EXISTS b62_retroactive_labels  CASCADE;

DELETE FROM module_constants
 WHERE module_name = 'data_archive'
   AND constant_name LIKE 'b70_%';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- B75 — Data Lifecycle / Tiered Storage — ROLLBACK
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Reverts the B75 schema additions. Use only if the batch needs to be unwound
-- before any sweep has fired. Once sweeps have populated `data_archive_manifest`
-- and dropped hot-tier partitions, this rollback would orphan the warm-tier
-- exports — recovery would require running `b75-rehydrate.ts` first.
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Drop database_monitor constants
DELETE FROM module_constants
WHERE module_name = 'database_monitor'
  AND constant_name IN ('plan_cap_mb', 'warning_threshold_pct', 'critical_threshold_pct');

-- 2. Drop data_lifecycle constants
DELETE FROM module_constants
WHERE module_name = 'data_lifecycle';

-- 3. Drop manifest indexes + table
DROP INDEX IF EXISTS data_archive_manifest_pending;
DROP INDEX IF EXISTS data_archive_manifest_state;
DROP INDEX IF EXISTS data_archive_manifest_source_range;
DROP TABLE IF EXISTS data_archive_manifest;

-- 4. Restore module_constants comment to its pre-B75 form
COMMENT ON TABLE module_constants IS NULL;

COMMIT;

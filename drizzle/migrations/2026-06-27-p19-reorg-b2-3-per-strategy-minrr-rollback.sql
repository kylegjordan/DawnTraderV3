-- ROLLBACK for 2026-06-27-p19-reorg-b2-3-per-strategy-minrr.sql
-- Restores the pre-batch state: the flat global min_rr=2.5 on the per-class '*' default, and removes the
-- per-strategy floors + the min_rr_unknown_floor rows. NOT registered in MANIFEST (rollback files don't run
-- in the forward migrator) — apply manually if reverting.

BEGIN;

-- Remove the per-(strategy×class) min_rr floors (keep only the '*' default row per class).
DELETE FROM module_constants
  WHERE module_name = 'expectancy_gates' AND constant_name = 'min_rr' AND strategy <> '*';

-- Restore the per-class '*' default to the pre-batch 2.5.
UPDATE module_constants
  SET value = '2.5'::jsonb, updated_at = NOW(), updated_by = 'reorg-b2-3-rollback'
  WHERE module_name = 'expectancy_gates' AND constant_name = 'min_rr' AND strategy = '*'
    AND asset_class IN ('crypto_spot', 'xstock_spot');

-- Remove the unknown-token fail-closed floor rows (new in this batch).
DELETE FROM module_constants
  WHERE module_name = 'expectancy_gates' AND constant_name = 'min_rr_unknown_floor';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- B-XSTOCK-CALIB · F-NOW ROLLBACK — drop the calibration_state columns
-- ═════════════════════════════════════════════════════════════════════════════
-- NOTE: rolling this back loses the pre-calibration tags. Only run if also
-- reverting the writer (persistExits sub-select) + aggregator exclusion clause.
-- The DROP COLUMN cascades the backfilled values away; re-applying the forward
-- migration re-backfills from the same uniform rule.
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE exit_strategy_alternates DROP COLUMN IF EXISTS calibration_state;
ALTER TABLE vts_open_trades          DROP COLUMN IF EXISTS calibration_state;

COMMIT;

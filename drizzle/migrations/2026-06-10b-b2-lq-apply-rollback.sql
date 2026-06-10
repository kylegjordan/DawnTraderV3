-- Rollback for 2026-06-10b-b2-lq-apply.sql (operator-only; auto-skipped by db-migrate).
-- Restores lq_min 38 -> 43 (22 main paths), strong_trend 33 -> 30 (paper vts) / 35 (live active),
-- and the scoreboard rows to their pre-apply state.

BEGIN;

UPDATE screener_filters
SET lq_min = 43, last_updated_by = 'b2-lq-apply-ROLLBACK', updated_at = NOW()
WHERE asset_class = 'xstock_spot' AND lq_min = 38
  AND filter_path NOT IN ('vts_strong_trend', 'active_strong_trend');

UPDATE screener_filters
SET lq_min = 30, last_updated_by = 'b2-lq-apply-ROLLBACK', updated_at = NOW()
WHERE asset_class = 'xstock_spot' AND filter_path = 'vts_strong_trend' AND lq_min = 33;

UPDATE screener_filters
SET lq_min = 35, last_updated_by = 'b2-lq-apply-ROLLBACK', updated_at = NOW()
WHERE asset_class = 'xstock_spot' AND filter_path = 'active_strong_trend' AND lq_min = 33;

UPDATE calibration_ledger
SET status = 'proposed', updated_at = NOW()
WHERE asset_class = 'xstock_spot' AND sub_batch = 'B.0' AND setting_key = 'lq_min'
  AND scope = 'imf · 22 paths';

UPDATE calibration_ledger
SET planned_value = NULL, planned_sub_batch = NULL, status = 'baseline', updated_at = NOW()
WHERE asset_class = 'xstock_spot' AND sub_batch = 'B.0' AND setting_key = 'lq_min'
  AND scope IN ('imf · active_strong_trend', 'imf · vts_strong_trend');

COMMIT;

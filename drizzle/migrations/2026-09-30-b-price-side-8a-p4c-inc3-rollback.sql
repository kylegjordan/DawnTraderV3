-- Rollback for 2026-09-30-b-price-side-8a-p4c-inc3.sql (B-PRICE-SIDE-BY-JOB 8a-P4c increment 3).
-- Removes the VTS xStock exit spread ceiling and steps the two VTS epochs back (only the rows this migration wrote).
-- ⚠️ The epoch step back restores the NUMBER, not the prior updated_by stamps (b-price-side-8a-p3 / b-price-side-8a-p4b).
BEGIN;

DELETE FROM module_constants
WHERE module_name = 'vts_xstock_touch' AND constant_name = 'exit_max_spread_fraction'
  AND asset_class = 'xstock_spot' AND updated_by = 'b-price-side-8a-p4c-inc3';

UPDATE module_constants mc
SET value = to_jsonb((mc.value)::text::numeric - 1), updated_at = NOW()
WHERE mc.module_name = 'calibration_epoch'
  AND mc.constant_name = 'vts'
  AND mc.exchange = '*' AND mc.strategy = '*' AND mc.regime = '*'
  AND mc.asset_class IN ('crypto_spot', 'xstock_spot')
  AND mc.updated_by = 'b-price-side-8a-p4c-inc3';

DELETE FROM _migrations WHERE name = '2026-09-30-b-price-side-8a-p4c-inc3.sql';

COMMIT;

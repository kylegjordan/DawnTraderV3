-- B-PHASE-A2 rollback — delete xstock_spot DBS calculation rows.
--
-- Restores pre-B-PHASE-A2 state where xstock callers fall through to the
-- wildcard min_sample_count=20 row. Note: rolling back this migration
-- WITHOUT rolling back the application code will cause the xStock store's
-- publishSnapshot() to read 20 from the wildcard (still works, just uses
-- the wrong floor — degraded, not broken).
--
-- For full rollback, revert the migration AND revert the application
-- commits (e84657110, 9cdafa7df, 2a9341b87) in reverse order.

BEGIN;

DELETE FROM module_constants
WHERE module_name = 'dbs_calculation'
  AND asset_class = 'xstock_spot'
  AND constant_name IN (
    'min_sample_count',
    'sector_coverage_floor',
    'slope_weight',
    'return_weight',
    'ema_weight',
    'lookback_period',
    'ema_fast_period',
    'ema_slow_period'
  );

COMMIT;

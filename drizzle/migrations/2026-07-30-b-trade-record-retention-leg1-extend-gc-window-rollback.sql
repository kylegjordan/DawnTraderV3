-- ROLLBACK for 2026-07-30-b-trade-record-retention-leg1-extend-gc-window.sql
--
-- Returns the vts_open_trades closed-row GC window to 90 days.
--
-- ⚠️ READ BEFORE RUNNING THIS. Applying this rollback RE-ARMS an irreversible
-- deletion. The forward migration exists to stop closed VTS trade rows being
-- hard-deleted with no archive copy; at 90 days the first cohort (rows closed
-- from 2026-05-11) is already past the window, so the NEXT BOOT after this
-- rollback will delete them — and boot happens often (measured: ~18h mean
-- uptime). There is no undo.
--
-- Only run this if the at-risk fields are genuinely preserved elsewhere
-- (leg 2 forward-protection AND leg 3 pre-June backfill both landed and
-- verified), or if Kyle explicitly accepts the loss. It is not a routine
-- revert.

BEGIN;

INSERT INTO module_constants
  (module_name, constant_name, value, asset_class, exchange, regime, strategy, updated_at, updated_by)
VALUES
  ('data_lifecycle', 'vts_open_trades.closed_gc_retention_days', '90'::jsonb, '*', '*', '*', '*', NOW(), 'b-trade-record-retention-leg1-rollback')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
  DO UPDATE SET value = '90'::jsonb,
                updated_at = NOW(),
                updated_by = 'b-trade-record-retention-leg1-rollback';

COMMIT;

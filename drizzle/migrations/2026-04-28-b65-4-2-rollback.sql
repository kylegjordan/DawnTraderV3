-- B65.4.2 Rollback — Drop ladder observability columns from paper_sim_trades
--
-- Note: rolling back the columns DROPS any data captured under B65.4.2.
-- The corresponding TrailingState fields (in-memory) are unaffected; the
-- engine continues to capture them, they just won't be persisted.

BEGIN;

ALTER TABLE paper_sim_trades
  DROP COLUMN IF EXISTS original_stop_price,
  DROP COLUMN IF EXISTS latch_trigger_price,
  DROP COLUMN IF EXISTS rung_target_history;

COMMIT;

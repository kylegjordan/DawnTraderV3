-- B65.2 rollback — reverses 2026-04-23-b65-2-trailing-exit-seeds-and-trade-mode.sql
-- Safe to run multiple times. Idempotent via IF EXISTS guards.

BEGIN;

-- Remove the trade_mode column + constraint
ALTER TABLE paper_sim_trades
  DROP CONSTRAINT IF EXISTS paper_sim_trades_trade_mode_chk;

ALTER TABLE paper_sim_trades
  DROP COLUMN IF EXISTS trade_mode;

-- Remove the B65.2 seed rows
DELETE FROM module_constants
 WHERE updated_by = 'b65.2-migration';

COMMIT;

-- B65.4 rollback — reverses 2026-04-25-b65-4-add-ladder-rungs.sql
-- Idempotent via IF EXISTS guard.

BEGIN;

ALTER TABLE paper_sim_trades
  DROP COLUMN IF EXISTS ladder_rungs_hit;

COMMIT;

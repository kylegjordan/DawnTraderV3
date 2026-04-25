-- B65.4 Migration — add ladder_rungs_hit to paper_sim_trades
--
-- Surfaces the trailing-engine ladder rung count on closed simulated trades
-- so the ML page (and CSV export) can show how far up the moonbag ladder
-- each trade climbed before reversing.
--
-- 0 = trade closed without entering moonbag (target/stop/timeout/qualifier-rejected)
-- 1+ = trade entered moonbag and ratcheted through N rungs before exiting
--
-- See `1-system-manual/SYSTEM_MANUAL.md` §5 TrailingExitController for the
-- full ladder semantics and `BATCH_65_4_SCOPE.md` for the design rationale.
--
-- Rollback: 2026-04-25-b65-4-rollback.sql

BEGIN;

ALTER TABLE paper_sim_trades
  ADD COLUMN IF NOT EXISTS ladder_rungs_hit INTEGER NOT NULL DEFAULT 0;

UPDATE paper_sim_trades SET ladder_rungs_hit = 0 WHERE ladder_rungs_hit IS NULL;

COMMENT ON COLUMN paper_sim_trades.ladder_rungs_hit IS
  'B65.4 (2026-04-25): number of ladder-rung target ratchets the trade hit before closing. 0 = closed at original target/stop without entering moonbag (or qualifier rejected). 1+ = trade ran past N rung targets in moonbag mode before reversing through the ratcheted stop.';

COMMIT;

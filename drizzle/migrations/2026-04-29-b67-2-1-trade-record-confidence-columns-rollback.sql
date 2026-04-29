-- Rollback for 2026-04-29-b67-2-1-trade-record-confidence-columns.sql

BEGIN;

ALTER TABLE paper_sim_trades
  DROP CONSTRAINT IF EXISTS paper_sim_trades_phase_check;

ALTER TABLE paper_sim_trades
  DROP COLUMN IF EXISTS regime_confidence_raw,
  DROP COLUMN IF EXISTS macro_modifier_value,
  DROP COLUMN IF EXISTS phase,
  DROP COLUMN IF EXISTS phase_age_seconds,
  DROP COLUMN IF EXISTS strategy_phase_weight,
  DROP COLUMN IF EXISTS regime_confidence_modulated;

COMMIT;

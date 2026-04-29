-- B67.2.1 Migration — Persist regime confidence + macro modifier + phase on trade records
--
-- Per Kyle directive 2026-04-29 (master plan §0.11.D): every trade record
-- needs to carry the modulated regime confidence + the macro modifier value
-- + the phase + age + applied phase weight at trade-open. Currently these
-- live ONLY in `regime_factor_alternates` ablation rows, which is
-- insufficient for daily monitoring during the calibration window AND for
-- post-hoc analysis of trades by confidence/modifier/phase.
--
-- Adds 6 nullable columns to paper_sim_trades. Nullable because:
-- - rows pre-B67.2.1 deploy don't have these values
-- - VTS path persists trades elsewhere (JSONL), not in this table — VTS
--   path additions land via the JSONL schema in a separate commit
--
-- Active trading writes via storage.createPaperSimTrade(); B67.2.1 adds the
-- new fields to that call site so when active trading turns back on every
-- new row carries the values.
--
-- Rollback: 2026-04-29-b67-2-1-trade-record-confidence-columns-rollback.sql

BEGIN;

ALTER TABLE paper_sim_trades
  ADD COLUMN IF NOT EXISTS regime_confidence_raw         REAL,
  ADD COLUMN IF NOT EXISTS macro_modifier_value          REAL,
  ADD COLUMN IF NOT EXISTS phase                         TEXT,
  ADD COLUMN IF NOT EXISTS phase_age_seconds             INTEGER,
  ADD COLUMN IF NOT EXISTS strategy_phase_weight         REAL,
  ADD COLUMN IF NOT EXISTS regime_confidence_modulated   REAL;

-- Phase column gets a CHECK constraint to enforce the canonical values
-- (or NULL for legacy rows). Idempotent: drop if exists, then add.
ALTER TABLE paper_sim_trades
  DROP CONSTRAINT IF EXISTS paper_sim_trades_phase_check;

ALTER TABLE paper_sim_trades
  ADD CONSTRAINT paper_sim_trades_phase_check
  CHECK (phase IS NULL OR phase IN ('EARLY', 'PRIME', 'LATE'));

COMMIT;

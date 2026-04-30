-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-04-30 — B67.0.1 + B73.1 Ablation Fixes
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Combined sub-batch fix for both ablation tables:
--
-- B67.0.1 — Factor ablation join broken (0/1406 matched). Two emit paths
-- generate IDs independently (vsig_p10_* in factor-emit; vts_<sym>_<strat>_<ts>
-- in vts-runner trade.id / JSONL). Per Langston cc-inbox #864 Q1: switch from
-- ID-based join to (pair_symbol, evaluated_at±60s, strategy) tuple — a natural
-- key derived from the same source data on both sides, immune to ID-format
-- drift. Adds `strategy` column + composite index.
--
-- B73.1 — Variant collapse (11/12 identical). Three structural fixes per
-- Langston cc-inbox #864 Q2 covered in code (real ATR plumbed through trade
-- record, Variant A = realized truth, TIMEOUT inherits realized exit). This
-- migration only drops the now-bad rows so the table can repopulate cleanly.
-- ═══════════════════════════════════════════════════════════════════════════

-- B67.0.1: add strategy + composite index for natural-key join
ALTER TABLE regime_factor_alternates
  ADD COLUMN IF NOT EXISTS strategy TEXT;

CREATE INDEX IF NOT EXISTS regime_factor_alternates_natural_key_idx
  ON regime_factor_alternates (pair_symbol, evaluated_at, strategy);

-- B73.1: wipe 468 known-bad rows (n=39 trades × 12 variants). Per Langston
-- cc-inbox #864 Q3: forward-only would leave bad data polluting aggregate
-- queries. Clean wipe; table repopulates as new VTS trades close.
DELETE FROM exit_strategy_alternates;

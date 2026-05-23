-- db-migrate:skip
-- B-NEW-43 Phase 2 chunk 4.7 (2026-05-23): bulk skip-marker added. This
-- migration's effects are already captured in 2026-04-22-initial-schema.sql
-- (pg_dump of staging state on 2026-05-23). On a fresh empty Postgres,
-- initial-schema applies the FINAL state; re-running this delta would
-- duplicate-create or otherwise conflict (idempotent ALTER-IF-NOT-EXISTS
-- migrations would no-op but still run unnecessarily; non-idempotent ones
-- would error). Skip-marker ledger-records as applied without running the
-- SQL. See scripts/db-migrate.ts SKIP_MARKER + 1-system-manual/staging-
-- coordination/2026-04-22-initial-schema-mark-applied.sql for the full
-- staging-vs-CI bootstrap divergence model.
-- B68.3 — Pair Correlation as confidence dimension
--
-- Adds per-pair Spearman correlation to BTC as orthogonal confidence dimension.
-- Distinguishes idiosyncratic alt moves from BTC-correlated drift per master
-- plan §5.4 #5. Mirrors B68.2 chain factor pattern: pure-function score over
-- rolling OHLC + narrow-band confidence factor + ablation row.
--
-- §D.1 (Langston cc-inbox #883): idiosyncratic_threshold promoted to module_
-- constant from v1 (8 keys total, matches B68.2 pattern).
-- §D.2 (Langston cc-inbox #883): both threshold comparisons use |corr|
-- absolute value so anti-correlated pairs also flag as DRIFTING.
--
-- Reuses existing spearmanRankCorrelation from server/strategies/strategy-
-- helpers.ts (already used by defensive-hedge.ts).
--
-- Modulation chain after this batch:
--   raw × macro × phase × freshness × outcome × volume_regime
--     × pair_correlation → clamp [0.4, 1.0]
--
-- Score formula (pair-correlation.ts):
--   pairReturns = (close[i] - close[i-1]) / close[i-1] over N bars
--   btcReturns  = same against BTC reference symbol's OHLC
--   correlationToBtc   = spearmanRankCorrelation(pairReturns, btcReturns)
--   decorrelationScore = 1 - |correlationToBtc|
--   factor             = clamp(min, max, 1.0 + decorrelationScore × sensitivity)
--
-- Asymmetric factor range [0.95, 1.05] — boost only for decorrelated pairs;
-- highly-correlated pairs get factor=1.0 (no penalty). Floor at 0.95 future-
-- proofs for v2 if calibration shows correlated pairs should be penalized.
--
-- Seed values:
--   b68_3_lookback_bars            = 30        — matches B68.2 / HF7 / B62
--   b68_3_btc_reference_symbol     = "XXBTZUSD" — Kraken REST format
--                                     matches defensive-hedge's existing BTC
--                                     OHLC fetch at vts-runner.ts:2248 → both
--                                     consumers share the same ohlcCache entry
--                                     (Langston pre-audit refinement)
--   b68_3_factor_min               = 0.95
--   b68_3_factor_max               = 1.05
--   b68_3_sensitivity              = 0.05      — narrow band per Langston B.4
--   b68_3_min_samples              = 30        — cold-start floor
--   b68_3_drifting_threshold       = 0.70      — |corr| ≥ 0.70 → DRIFTING
--   b68_3_idiosyncratic_threshold  = 0.30      — |corr| ≤ 0.30 → IDIOSYNCRATIC

BEGIN;

INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('pair_correlation', '*', '*', '*', '*', 'b68_3_lookback_bars',          '30'::jsonb,         'b68.3-pair-correlation'),
  ('pair_correlation', '*', '*', '*', '*', 'b68_3_btc_reference_symbol',   '"XXBTZUSD"'::jsonb, 'b68.3-pair-correlation'),
  ('pair_correlation', '*', '*', '*', '*', 'b68_3_factor_min',             '0.95'::jsonb,       'b68.3-pair-correlation'),
  ('pair_correlation', '*', '*', '*', '*', 'b68_3_factor_max',             '1.05'::jsonb,       'b68.3-pair-correlation'),
  ('pair_correlation', '*', '*', '*', '*', 'b68_3_sensitivity',            '0.05'::jsonb,       'b68.3-pair-correlation'),
  ('pair_correlation', '*', '*', '*', '*', 'b68_3_min_samples',            '30'::jsonb,         'b68.3-pair-correlation'),
  ('pair_correlation', '*', '*', '*', '*', 'b68_3_drifting_threshold',     '0.70'::jsonb,       'b68.3-pair-correlation'),
  ('pair_correlation', '*', '*', '*', '*', 'b68_3_idiosyncratic_threshold','0.30'::jsonb,       'b68.3-pair-correlation')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
DO UPDATE SET
  value = EXCLUDED.value,
  updated_by = EXCLUDED.updated_by,
  updated_at = NOW();

COMMIT;

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
-- B67.2 Migration — Phase Dimension (EARLY / PRIME / LATE)
--
-- Per BATCH_67_2_SCOPE.md (Langston-approved cc-inbox #844, 2026-04-28).
-- Per Kyle directive 2026-04-29: no shadow flag, no fallbacks, all live.
--
-- Adds 3 module_constants seed rows in the new 'regime_phase' module:
--   - b67_2_early_phase_max_hours (float, 2.0): EARLY → PRIME boundary
--   - b67_2_prime_phase_max_hours (float, 12.0): PRIME → LATE boundary
--   - b67_2_strategy_phase_weights (JSONB, 54 cells): per-strategy-per-phase weights
--
-- Phase definitions (per scope §7.1):
--   EARLY = 0..early_phase_max_hours since regime entry
--   PRIME = early_phase_max_hours..prime_phase_max_hours
--   LATE  = prime_phase_max_hours+
--
-- 54 cells = 18 canonical strategies × 3 phases. Approved cc-inbox #843
-- (B67_2_STRATEGY_PHASE_WEIGHT_SEEDS.md) with the range_trade tweak applied
-- per Langston review:
--   range_trade: EARLY 0.95 → 0.90, PRIME 1.10 (unchanged), LATE 1.00 → 1.05
--   (rationale: aged ranges are more confirmed; range_trade is itself a
--   boundary-fader so LATE bonus is consistent with mean_reversion LATE=1.10)
--
-- SEED VALUES — recalibrate after 14d post-deploy from regime-age-conditional
-- WR curves bucketed by strategy family (per Langston cc-inbox #842).
--
-- Hard-contract: no fallback for missing key. Lookup misses throw with
-- [B67.2][missing-weight] error. Every canonical strategy must have all 3
-- phase rows seeded here. Future strategy additions must seed their own.
--
-- Rollback: 2026-04-29-b67-2-rollback.sql

BEGIN;

INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('regime_phase', '*', '*', '*', '*', 'b67_2_early_phase_max_hours',
   '2.0'::jsonb,
   'b67.2-migration'),
  ('regime_phase', '*', '*', '*', '*', 'b67_2_prime_phase_max_hours',
   '12.0'::jsonb,
   'b67.2-migration'),
  ('regime_phase', '*', '*', '*', '*', 'b67_2_strategy_phase_weights',
   '{
      "sma_trend_ride_EARLY": 0.95,
      "sma_trend_ride_PRIME": 1.10,
      "sma_trend_ride_LATE":  0.90,

      "vwap_pullback_EARLY":  0.90,
      "vwap_pullback_PRIME":  1.10,
      "vwap_pullback_LATE":   0.95,

      "morning_star_EARLY":   1.00,
      "morning_star_PRIME":   1.00,
      "morning_star_LATE":    1.05,

      "pivot_shift_EARLY":    1.05,
      "pivot_shift_PRIME":    1.00,
      "pivot_shift_LATE":     1.05,

      "mean_reversion_EARLY": 0.90,
      "mean_reversion_PRIME": 1.00,
      "mean_reversion_LATE":  1.10,

      "reverse_impulse_EARLY": 0.95,
      "reverse_impulse_PRIME": 1.00,
      "reverse_impulse_LATE":  1.10,

      "defensive_hedge_EARLY": 0.95,
      "defensive_hedge_PRIME": 1.00,
      "defensive_hedge_LATE":  1.05,

      "inside_bar_reversal_EARLY": 1.00,
      "inside_bar_reversal_PRIME": 1.00,
      "inside_bar_reversal_LATE":  1.05,

      "range_trade_EARLY":    0.90,
      "range_trade_PRIME":    1.10,
      "range_trade_LATE":     1.05,

      "support_bounce_EARLY": 1.00,
      "support_bounce_PRIME": 1.05,
      "support_bounce_LATE":  0.95,

      "abcd_long_EARLY":      1.00,
      "abcd_long_PRIME":      1.05,
      "abcd_long_LATE":       0.95,

      "adaptive_flow_EARLY":  1.00,
      "adaptive_flow_PRIME":  1.00,
      "adaptive_flow_LATE":   1.00,

      "breakout_EARLY":       1.10,
      "breakout_PRIME":       1.00,
      "breakout_LATE":        0.85,

      "vwap_bounce_EARLY":    1.05,
      "vwap_bounce_PRIME":    1.00,
      "vwap_bounce_LATE":     0.95,

      "volatility_edge_EARLY": 1.10,
      "volatility_edge_PRIME": 1.00,
      "volatility_edge_LATE":  0.85,

      "dhma_EARLY":           0.95,
      "dhma_PRIME":           1.05,
      "dhma_LATE":            0.95,

      "liquidity_trap_EARLY": 1.10,
      "liquidity_trap_PRIME": 1.00,
      "liquidity_trap_LATE":  0.90,

      "strong_bull_trend_EARLY": 1.05,
      "strong_bull_trend_PRIME": 1.10,
      "strong_bull_trend_LATE":  0.85
    }'::jsonb,
   'b67.2-migration')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
DO UPDATE SET
  value = EXCLUDED.value,
  updated_by = EXCLUDED.updated_by,
  updated_at = NOW();

COMMIT;

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
-- B79.0n.STORAGE — seed missing xstock_spot rows in screener_filters
-- Cloned from crypto_spot baseline per Langston Step 2 ACK Q4 (placeholder values;
-- Layer 3 calibration ticket required before Phase 19 xStock active-trading enablement).
--
-- Pre-deploy live coverage (2026-05-21 PM psql against migration/aws-supabase HEAD d912ba0d5):
--   crypto_spot/live:  12/12 ✓
--   crypto_spot/paper: 12/12 ✓
--   xstock_spot/live:   7/12 — missing: vts_quant, vts_trend, vts_reversal, vts_breakout, vts_oscillator
--   xstock_spot/paper:  7/12 — missing: active_breakout, active_oscillator, active_reversal, active_trend, vts_quant
-- Total: 10 missing rows. Migration is idempotent (ON CONFLICT DO NOTHING).

INSERT INTO screener_filters (
  id, mode, asset_class, filter_path,
  min_volume, min_price, max_price, min_market_cap, max_bid_ask_spread,
  rsi_min, rsi_max, volatility_min, volatility_max,
  exclude_stablecoins, min_liquidity, allow_regulated_only,
  universe_size, quote_currencies, active_timeframes, confidence_threshold,
  managed_by_lottie, manual_override_enabled, locked_by_user, filter_overrides,
  min_history_days, final_score_min, regime_weight_min,
  lq_min, vn_max, di_min, di_max, volume_24h_min,
  strategies, description, enabled, corr_max, tunable_status,
  last_updated_by, created_at, updated_at
)
SELECT
  gen_random_uuid(), s.mode, 'xstock_spot', s.filter_path,
  s.min_volume, s.min_price, s.max_price, s.min_market_cap, s.max_bid_ask_spread,
  s.rsi_min, s.rsi_max, s.volatility_min, s.volatility_max,
  s.exclude_stablecoins, s.min_liquidity, s.allow_regulated_only,
  s.universe_size, s.quote_currencies, s.active_timeframes, s.confidence_threshold,
  s.managed_by_lottie, s.manual_override_enabled, s.locked_by_user, s.filter_overrides,
  s.min_history_days, s.final_score_min, s.regime_weight_min,
  s.lq_min, s.vn_max, s.di_min, s.di_max, s.volume_24h_min,
  s.strategies, s.description, s.enabled, s.corr_max, s.tunable_status,
  'b79-0n-storage-seed', NOW(), NOW()
FROM screener_filters s
WHERE s.asset_class = 'crypto_spot'
  AND (
    (s.mode = 'live'  AND s.filter_path IN ('vts_quant','vts_trend','vts_reversal','vts_breakout','vts_oscillator'))
    OR
    (s.mode = 'paper' AND s.filter_path IN ('active_breakout','active_oscillator','active_reversal','active_trend','vts_quant'))
  )
ON CONFLICT (mode, asset_class, filter_path) DO NOTHING;

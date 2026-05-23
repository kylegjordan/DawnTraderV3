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
-- B79.0m.a — xstock_spot family-IMF rows (5 family paths × 2 modes = 10 rows)
-- + screener_filters mode=live row (currently only paper exists)
--
-- Starter values cloned from crypto_spot family-IMF rows as Layer-1 baseline.
-- Layer-3 (post-wire evidence accumulation) calibrates from xstock VTS data.
-- Tagged `last_updated_by='b79.0m.a-layer1-starter-cloned-from-crypto'` so
-- future audits can locate them via `SELECT ... WHERE last_updated_by LIKE
-- 'b79.0m.a-layer1%'`.
--
-- The 5 family paths map regime → filter family per Stage 5 architecture:
--   vts_trend       ← TREND_FRIENDLY_STABLE family
--   vts_reversal    ← RANGE_BOUND_STABLE family
--   vts_breakout    ← IMPULSE_EXPANSION family
--   vts_oscillator  ← HIGH_VOLATILITY_UNSTABLE family
--   vts_strong_trend ← B63.3 strong-trend lane (Path D, |DBS|>=0.35 LONG-only)
--
-- active_* variants mirror vts_* but with slightly tighter VN thresholds.

BEGIN;

INSERT INTO screener_filters
  (mode, asset_class, filter_path, lq_min, vn_max, di_min, di_max, last_updated_by)
VALUES
  -- VTS (passive learning) paths
  ('paper', 'xstock_spot', 'vts_trend',        43.0000, 0.9500, 10.0000, 100.0000, 'b79.0m.a-layer1-starter-cloned-from-crypto'),
  ('paper', 'xstock_spot', 'vts_reversal',     43.0000, 0.9500,  0.0000,  40.0000, 'b79.0m.a-layer1-starter-cloned-from-crypto'),
  ('paper', 'xstock_spot', 'vts_breakout',     43.0000, 0.9500, 10.0000, 100.0000, 'b79.0m.a-layer1-starter-cloned-from-crypto'),
  ('paper', 'xstock_spot', 'vts_oscillator',   43.0000, 0.9500,  0.0000,  35.0000, 'b79.0m.a-layer1-starter-cloned-from-crypto'),
  ('paper', 'xstock_spot', 'vts_strong_trend', 30.0000, 0.9800,  0.0000, 100.0000, 'b79.0m.a-layer1-starter-cloned-from-crypto'),

  -- Active trading paths (mode=live)
  ('live',  'xstock_spot', 'active_trend',        43.0000, 0.8500, 10.0000, 100.0000, 'b79.0m.a-layer1-starter-cloned-from-crypto'),
  ('live',  'xstock_spot', 'active_reversal',     43.0000, 0.8500,  0.0000,  35.0000, 'b79.0m.a-layer1-starter-cloned-from-crypto'),
  ('live',  'xstock_spot', 'active_breakout',     43.0000, 0.8500, 10.0000, 100.0000, 'b79.0m.a-layer1-starter-cloned-from-crypto'),
  ('live',  'xstock_spot', 'active_oscillator',   43.0000, 0.8500,  0.0000,  30.0000, 'b79.0m.a-layer1-starter-cloned-from-crypto'),
  ('live',  'xstock_spot', 'active_strong_trend', 35.0000, 0.9500,  0.0000, 100.0000, 'b79.0m.a-layer1-starter-cloned-from-crypto')
ON CONFLICT (mode, asset_class, filter_path) DO NOTHING;

-- Also seed the mode=live row for the GLOBAL (no filter_path) xstock entry
-- so schema-consistency invariant holds. Active trading off — row inert.
INSERT INTO screener_filters
  (mode, asset_class, min_volume, min_price, max_price, min_market_cap,
   max_bid_ask_spread, exclude_stablecoins, min_liquidity, universe_size,
   last_updated_by)
SELECT
  'live', 'xstock_spot', min_volume, min_price, max_price, min_market_cap,
  max_bid_ask_spread, exclude_stablecoins, min_liquidity, universe_size,
  'b79.0m.a-layer1-starter-cloned-from-paper-mode'
FROM screener_filters
WHERE asset_class='xstock_spot' AND mode='paper' AND filter_path IS NULL
ON CONFLICT (mode, asset_class, filter_path) DO NOTHING;

COMMIT;

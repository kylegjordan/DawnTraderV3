-- B79.0m.b2 — xstock_spot pattern-path rows (vts_pattern + active_pattern, 4 rows)
--
-- The xstock pipeline is gaining a parallel pattern path mirroring crypto's
-- `fx5-scanner.ts` shape. The pattern global filter + pattern IMF gate read
-- from these screener_filters rows.
--
-- Layer-1 baseline values cloned verbatim from crypto_spot rows verified
-- 2026-05-11 via psql. Tagged `last_updated_by='b79.0m.b2-pattern-path-
-- cloned-from-crypto'` so future audits can locate them via WHERE filter.
--
-- min_history_days is intentionally NOT used as a per-cycle bar-count gate
-- (mirrors `global-filter.ts:105-108` convention — corpus-level metadata
-- only). Per-cycle gate is a hardcoded 60-bar floor inside pattern-filter.ts.
-- Layer-3 calibration may migrate this floor to `module_constants.pattern_
-- pool_gates.min_bars_for_eval` alongside the equivalent global-filter floor.
--
-- pattern_pool_gates.xstock_spot.* rows (final_score_floor, max_position_pct)
-- already seeded by `2026-05-07-b79-xstock-module-constants.sql` — no
-- additional seed required in this migration.

BEGIN;

INSERT INTO screener_filters
  (mode, asset_class, filter_path,
   lq_min, vn_max, di_min, di_max,
   min_price, max_price, min_volume, max_bid_ask_spread,
   min_history_days, min_liquidity, min_market_cap,
   exclude_stablecoins, universe_size,
   confidence_threshold, final_score_min, regime_weight_min,
   rsi_min, rsi_max, volatility_min, volatility_max,
   last_updated_by)
VALUES
  -- vts_pattern (paper mode = passive learning / VTS)
  ('paper', 'xstock_spot', 'vts_pattern',
   43.0000, 0.9800, 3.0000, 100.0000,
   0.05000000, 99999999.99, 150000.00, 1.50,
   14, 150000.00, 25000000.00,
   false, 100,
   60, 0.3500, 0.3000,
   30, 70, 0.50, 5.00,
   'b79.0m.b2-pattern-path-cloned-from-crypto'),

  -- vts_pattern (live mode mirror — kept consistent with crypto's both-modes shape)
  ('live',  'xstock_spot', 'vts_pattern',
   43.0000, 0.9800, 3.0000, 100.0000,
   0.05000000, 99999999.99, 150000.00, 1.50,
   14, 150000.00, 25000000.00,
   false, 100,
   60, 0.3500, 0.3000,
   30, 70, 0.50, 5.00,
   'b79.0m.b2-pattern-path-cloned-from-crypto'),

  -- active_pattern (paper mode)
  ('paper', 'xstock_spot', 'active_pattern',
   43.0000, 0.9800, 5.0000, 100.0000,
   0.25000000, 99999999.99, 250000.00, 1.00,
   21, 250000.00, 50000000.00,
   false, 100,
   60, 0.3500, 0.3000,
   30, 70, 0.50, 5.00,
   'b79.0m.b2-pattern-path-cloned-from-crypto'),

  -- active_pattern (live mode)
  ('live',  'xstock_spot', 'active_pattern',
   43.0000, 0.9800, 5.0000, 100.0000,
   0.25000000, 99999999.99, 250000.00, 1.00,
   21, 250000.00, 50000000.00,
   false, 100,
   60, 0.3500, 0.3000,
   30, 70, 0.50, 5.00,
   'b79.0m.b2-pattern-path-cloned-from-crypto')
ON CONFLICT (mode, asset_class, filter_path) DO NOTHING;

-- Verify insert count = 4 (if any row already existed via prior rerun, count
-- will be lower; ON CONFLICT silently skips).
DO $$
DECLARE
  row_count integer;
BEGIN
  SELECT COUNT(*) INTO row_count
    FROM screener_filters
   WHERE asset_class='xstock_spot'
     AND filter_path IN ('vts_pattern','active_pattern');
  RAISE NOTICE '[B79.0m.b2] xstock_spot pattern rows present: %', row_count;
  IF row_count <> 4 THEN
    RAISE WARNING '[B79.0m.b2] expected 4 pattern rows, found %', row_count;
  END IF;
END $$;

COMMIT;

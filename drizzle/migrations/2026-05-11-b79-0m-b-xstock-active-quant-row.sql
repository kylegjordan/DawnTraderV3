-- B79.0m.b — xstock_spot global active_quant screener_filters row.
--
-- Why: B79.0m.a authored family-IMF rows for xstock_spot
-- (vts_*/active_* paths) but did NOT author a global `active_quant` row.
-- The new B79.0m.b `evaluateXstockGlobalFilter` looks up that exact
-- (mode, asset_class='xstock_spot', filter_path='active_quant') tuple
-- as the canonical global filter config, mirroring crypto's pattern.
-- Without these rows, the global filter rejects every pair with
-- `config_row_missing` and no signals ever reach SQE.
--
-- All rows tagged `last_updated_by='b79.0m.b-global-quant-row'`.

BEGIN;

INSERT INTO screener_filters
  (mode, filter_path, asset_class, min_price, max_price, min_volume,
   min_history_days, max_bid_ask_spread, final_score_min, regime_weight_min,
   enabled, last_updated_by)
VALUES
  ('paper'::trading_mode, 'active_quant', 'xstock_spot', 1.00, 10000.00,
   100000.00, 30, 1.0, 0.35, 0.30, true, 'b79.0m.b-global-quant-row'),
  ('live'::trading_mode,  'active_quant', 'xstock_spot', 1.00, 10000.00,
   100000.00, 30, 1.0, 0.35, 0.30, true, 'b79.0m.b-global-quant-row')
ON CONFLICT (mode, asset_class, filter_path) DO NOTHING;

COMMIT;

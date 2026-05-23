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

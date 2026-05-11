-- B79.0g-tx — seed module_constants row for vts_open_trades GC retention.
-- Read by sweepClosedOpenTrades() at boot. HARD-FAIL semantics: missing row
-- skips the sweep with [CONFIG_MISSING] log line; does NOT halt boot.

BEGIN;

INSERT INTO module_constants
  (module_name, constant_name, value, asset_class, exchange, regime, strategy, updated_at, updated_by)
VALUES
  ('data_lifecycle', 'vts_open_trades.closed_gc_retention_days', '90'::jsonb, '*', '*', '*', '*', NOW(), 'b79-0g-tx-migration')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

COMMIT;

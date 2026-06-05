-- B.5 W2.1 ROLLBACK — restore the legacy ambiguous duration keys and drop the
-- new `max_holding_ms` rows seeded by 2026-06-06-b5-w21-max-holding-ms.sql.
--
-- NOTE: a full code rollback is ALSO required for behavior to revert — the code
-- now reads `metadata.maxHoldingMs` (ms) and resolves `max_holding_ms`. This
-- SQL only reverts the DB side. Restores the two original live rows at their
-- original values (vwap_pullback bars=24, breakout hours=12).

BEGIN;

-- Re-insert the two original live rows (the only ones that existed pre-W2.1).
INSERT INTO module_constants
  (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by, updated_at)
VALUES
  ('strategy.vwap_pullback', '*', '*', 'vwap_pullback', '*', 'max_holding_period_bars_default', '24'::jsonb, 'b5-w21-rollback', NOW()),
  ('strategy.breakout',      '*', '*', 'breakout',      '*', 'max_holding_hours',               '12'::jsonb, 'b5-w21-rollback', NOW())
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO UPDATE SET
  value = EXCLUDED.value, updated_at = NOW(), updated_by = 'b5-w21-rollback';

-- Drop every max_holding_ms row this migration created (both the `*` wildcard
-- rows and the 10 xstock_spot seeds).
DELETE FROM module_constants
  WHERE constant_name = 'max_holding_ms'
    AND updated_by = 'b5-w21-max-holding-ms';

COMMIT;

-- Verification query (run after COMMIT):
SELECT module_name, exchange, asset_class, strategy, constant_name, value
FROM module_constants
WHERE constant_name IN ('max_holding_ms', 'max_holding_period_bars_default', 'max_holding_hours')
ORDER BY asset_class, module_name;

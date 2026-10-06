-- ROLLBACK for 2026-10-06-b-atr-bad-print-retire-daily-range-frac.sql (B-ATR-BAD-PRINT, #1153).
-- Re-inserts the one row the forward migration deleted, with the value and author read on staging 2026-10-06,
-- and clears the migration's ledger row so a later re-deploy re-applies the forward file.
-- Revert the CODE first or together: the forward commit's code no longer reads this key, so restoring the
-- row alone changes nothing; restoring the code without the row would hit a missing key.

BEGIN;
SET LOCAL lock_timeout = '5s';

INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
VALUES ('strategy.vwap_pullback', '*', '*', 'vwap_pullback', '*', 'atr_fallback_daily_range_frac', '0.10'::jsonb, 'b-atr-bad-print-rollback')
ON CONFLICT DO NOTHING;

DELETE FROM _migrations WHERE name = '2026-10-06-b-atr-bad-print-retire-daily-range-frac.sql';

COMMIT;

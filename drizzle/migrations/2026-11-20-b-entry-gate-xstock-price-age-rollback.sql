-- ROLLBACK for 2026-11-20-b-entry-gate-xstock-price-age.sql (B-ENTRY-GATE #1224, P7 xStock seed). Run by hand only.
-- Returns xstock_spot to NO ROW: the promotion price-age gate is OFF for xStock again and logs PRICE_AGE_GATE_OFF once per process.
BEGIN;
DELETE FROM module_constants
 WHERE module_name = 'entry_gate' AND constant_name = 'promotion_price_max_age_ms'
   AND asset_class = 'xstock_spot' AND updated_by = 'b-entry-gate-p7-xstock-seed';
COMMIT;

-- ROLLBACK for 2026-10-10-b-xstock-bid-trigger-reland-inca.sql (operator-only; NOT in MANIFEST).
-- ⚠️ The increment-A code asserts EXACTLY thirteen book_state rows at boot: run this only AFTER reverting the code, or
-- the server refuses to boot (fail-closed by design).
DELETE FROM module_constants
WHERE module_name = 'book_state' AND asset_class = 'xstock_spot' AND constant_name = 'ri_abs_spread_ceiling_pct'
  AND updated_by = 'b-xstock-bid-trigger-reland';

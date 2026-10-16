-- ROLLBACK for 2026-10-16-b-xstock-bid-trigger-reland-obj6.sql (operator-only; NOT in MANIFEST).
-- ⚠️ The objective-6 code asserts EXACTLY fourteen book_state rows at boot: run this only AFTER reverting the code, or the
-- server refuses to boot (fail-closed by design). To turn the arm OFF and keep the code, set the value to 0 instead.
DELETE FROM module_constants
WHERE module_name = 'book_state' AND asset_class = 'xstock_spot' AND constant_name = 'spread_blown_enabled'
  AND updated_by = 'b-xstock-bid-trigger-reland-obj6';

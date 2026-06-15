-- ROLLBACK for 2026-06-14-p19-b4a-c8-xstock-pattern-cap-correction.sql. NOT in MANIFEST.
-- Restores the prior placeholder 0.50.
BEGIN;
UPDATE module_constants SET value = '0.50'::jsonb, updated_by = 'p19-b4a-c8-rollback'
 WHERE module_name = 'pattern_pool_gates' AND asset_class = 'xstock_spot'
   AND strategy = '*' AND regime = '*' AND constant_name = 'pattern_max_position_pct';
COMMIT;

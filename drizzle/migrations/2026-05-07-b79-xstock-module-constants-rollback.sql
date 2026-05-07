-- B79 Migration ROLLBACK — xstock_spot module_constants seeds (additional).
-- Inverse of 2026-05-07-b79-xstock-module-constants.sql.

BEGIN;

DELETE FROM module_constants
WHERE asset_class = 'xstock_spot'
  AND (
    (module_name='mce_config'         AND constant_name='macro_modifier') OR
    (module_name='strategy_gates'     AND strategy='orb' AND constant_name='enabled') OR
    (module_name='pattern_pool_gates' AND constant_name IN ('final_score_floor','max_position_pct'))
  );

COMMIT;

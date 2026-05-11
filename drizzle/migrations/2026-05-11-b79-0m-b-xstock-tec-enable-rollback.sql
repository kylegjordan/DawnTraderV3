-- B79.0m.b TEC rollback — restore xstock_spot.break_even_enabled=false +
-- remove the 4 new TEC rows.

BEGIN;

UPDATE module_constants
   SET value = 'false'::jsonb,
       updated_at = NOW(),
       updated_by = 'b79.0m.b-rollback'
 WHERE module_name='trailing_exit' AND asset_class='xstock_spot'
   AND constant_name='break_even_enabled';

DELETE FROM module_constants
 WHERE module_name='trailing_exit' AND asset_class='xstock_spot'
   AND updated_by='b79.0m.b-layer1-starter-equity-baseline'
   AND constant_name IN ('break_even_trigger_r','target_lock_r','trail_distance_atr_multiplier','rung_floor_slippage_buffer_multiplier');

COMMIT;

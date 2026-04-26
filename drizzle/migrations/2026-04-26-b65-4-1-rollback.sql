-- B65.4.1 Rollback — Remove rung_floor_slippage_buffer_multiplier seed
--
-- Note: rolling back the SEED does NOT revert the code change in
-- cost-model.ts:computeNetTargetFloor. If the buffer multiplier row is
-- missing, the code falls back to the TEC_DEFAULTS value (1.0). To fully
-- revert to pre-B65.4.1 behavior, also revert the cost-model.ts code change
-- via git.

BEGIN;

DELETE FROM module_constants
 WHERE module_name = 'trailing_exit'
   AND exchange = '*'
   AND asset_class = '*'
   AND strategy = '*'
   AND regime = '*'
   AND constant_name = 'rung_floor_slippage_buffer_multiplier';

COMMIT;

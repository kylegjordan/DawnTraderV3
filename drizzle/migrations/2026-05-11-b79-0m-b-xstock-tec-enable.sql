-- B79.0m.b — xstock_spot TEC: enable BE protection + trailing exit per Kyle
-- directive 2026-05-11 "test our per-asset-class TEC settings while [BE/trail]
-- is off for crypto."
--
-- Q4 starter rule per Langston Step 2: R-based knobs same as crypto pre-K
-- (R is dimensionless); ATR-multiplier knobs 0.8× crypto pre-K (equity ATR
-- ~half crypto's; trail needs noise room but not crypto-sized room).
--
-- All rows tagged updated_by='b79.0m.b-layer1-starter-equity-baseline'.

BEGIN;

-- UPDATE existing break_even_enabled row (B79.TEC seeded as false)
UPDATE module_constants
   SET value = 'true'::jsonb,
       updated_at = NOW(),
       updated_by = 'b79.0m.b-layer1-starter-equity-baseline'
 WHERE module_name='trailing_exit' AND asset_class='xstock_spot'
   AND constant_name='break_even_enabled' AND regime='*' AND strategy='*';

-- INSERT remaining TEC rows for xstock_spot
INSERT INTO module_constants
  (module_name, constant_name, value, asset_class, exchange, regime, strategy, updated_at, updated_by)
VALUES
  ('trailing_exit', 'break_even_trigger_r',                  '1.0'::jsonb,  'xstock_spot', '*', '*', '*', NOW(), 'b79.0m.b-layer1-starter-equity-baseline'),
  ('trailing_exit', 'target_lock_r',                         '1.5'::jsonb,  'xstock_spot', '*', '*', '*', NOW(), 'b79.0m.b-layer1-starter-equity-baseline'),
  ('trailing_exit', 'trail_distance_atr_multiplier',         '0.8'::jsonb,  'xstock_spot', '*', '*', '*', NOW(), 'b79.0m.b-layer1-starter-equity-baseline'),
  ('trailing_exit', 'rung_floor_slippage_buffer_multiplier', '1.0'::jsonb,  'xstock_spot', '*', '*', '*', NOW(), 'b79.0m.b-layer1-starter-equity-baseline')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

COMMIT;

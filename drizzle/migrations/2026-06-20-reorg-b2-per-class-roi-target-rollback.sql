-- ROLLBACK for 2026-06-20-reorg-b2-per-class-roi-target.sql (operator-only).
-- Restores the global '*' ROI rows and removes the per-class rows + the new Piece-A constants.

-- Restore the global '*' rows (original B72 values).
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('expectancy_gates','*','*','*','*','roi_flex_multiplier','0.6'::jsonb,'reorg-b2-rollback'),
  ('expectancy_gates','*','*','*','*','roi_absolute_min','0.010'::jsonb,'reorg-b2-rollback'),
  ('expectancy_gates','*','*','*','*','roi_absolute_max','0.040'::jsonb,'reorg-b2-rollback'),
  ('roi_gating','*','*','*','TREND_FRIENDLY_STABLE','min_roi','0.0125'::jsonb,'reorg-b2-rollback'),
  ('roi_gating','*','*','*','HIGH_VOLATILITY_UNSTABLE','min_roi','0.0250'::jsonb,'reorg-b2-rollback'),
  ('roi_gating','*','*','*','RANGE_BOUND_STABLE','min_roi','0.0175'::jsonb,'reorg-b2-rollback'),
  ('roi_gating','*','*','*','IMPULSE_EXPANSION','min_roi','0.0300'::jsonb,'reorg-b2-rollback'),
  ('roi_gating','*','*','*','STRUCTURAL_TRANSITION','min_roi','0.0200'::jsonb,'reorg-b2-rollback')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
  DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by;

-- Remove the per-class rows + the new Piece-A constants.
DELETE FROM module_constants
  WHERE updated_by='reorg-b2'
    AND module_name IN ('expectancy_gates','roi_gating')
    AND asset_class IN ('crypto_spot','xstock_spot');
DELETE FROM module_constants
  WHERE module_name='expectancy_gates' AND constant_name IN ('target_floor_pct','min_rr','reach_atr_max');

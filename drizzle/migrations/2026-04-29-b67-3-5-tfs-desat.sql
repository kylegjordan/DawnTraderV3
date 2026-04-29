-- B67.3.5 — TFS branch desaturation scales
--
-- Replaces the step-function in market-regime.ts TFS branch with a continuous
-- mapping `confidence = min + (max - min) × (momentum_factor × dbs_strength × vol_inverse)`.
-- All 5 scaling parameters land in module_constants per §0.9 (no new hardcoded
-- constants). DBS denominator is included as a tunable per Langston cc-inbox
-- #852 — the regime classifier will be the most-tuned component once
-- calibration data starts flowing.
--
-- Seed values (BATCH_67_3_5_PRE_AUDIT.md §B.2):
--   desat_min = 0.50  — "barely qualifies as TFS" floor
--   desat_max = 0.90  — leaves room for B67.1 × B67.2 chain to clamp at 1.0
--                      only on excellent setups
--   momentum_scale    = 0.020 — top-decile momentum threshold; factor=1.0 here
--   volatility_scale  = 0.025 — vol_inverse=0 here (would route HVU); =1.0 at 0
--   dbs_scale         = 0.7   — strong-DBS threshold + buffer
--
-- Recalibration: post-deploy, query 7d distribution from
-- paper_sim_trades.regime_confidence_raw filtered to TFS rows. If P50
-- outside [0.60, 0.80], adjust scales via UPDATE — no code change.

BEGIN;

INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('regime_classifier', '*', '*', '*', 'TREND_FRIENDLY_STABLE', 'b67_3_5_tfs_desat_min',
   '0.50'::jsonb, 'b67.3.5-tfs-desaturation'),
  ('regime_classifier', '*', '*', '*', 'TREND_FRIENDLY_STABLE', 'b67_3_5_tfs_desat_max',
   '0.90'::jsonb, 'b67.3.5-tfs-desaturation'),
  ('regime_classifier', '*', '*', '*', 'TREND_FRIENDLY_STABLE', 'b67_3_5_tfs_momentum_scale',
   '0.020'::jsonb, 'b67.3.5-tfs-desaturation'),
  ('regime_classifier', '*', '*', '*', 'TREND_FRIENDLY_STABLE', 'b67_3_5_tfs_volatility_scale',
   '0.025'::jsonb, 'b67.3.5-tfs-desaturation'),
  ('regime_classifier', '*', '*', '*', 'TREND_FRIENDLY_STABLE', 'b67_3_5_tfs_dbs_scale',
   '0.7'::jsonb, 'b67.3.5-tfs-desaturation')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
DO UPDATE SET
  value = EXCLUDED.value,
  updated_by = EXCLUDED.updated_by,
  updated_at = NOW();

COMMIT;

-- B67.1 Migration — Macro Confidence Modifier
--
-- Per BATCH_67_1_SCOPE.md (Langston-approved cc-inbox #844, 2026-04-28).
--
-- Adds 11 module_constants seed rows in the new 'macro_modifier' module.
-- Modulates per-pair regime classifier confidence by an external-data-driven
-- multiplier in [0.85, 1.05]. Inputs: BTC dominance, derivatives funding rates,
-- total-mcap momentum.
--
-- Architecture: confidence-modifier on classifier output (Langston's Option C).
-- Label preserved; only confidence is modulated. Existing stability /
-- mode-overlay path consumes modulated confidence automatically.
--
-- SEED VALUES — recalibrate after 14d post-activation from B67.0 ablation rows
-- on hostile-day cohorts. See REGIME_OVERHAUL_AND_EXTERNAL_DATA_PLAN_2026_04_27.md
-- §0 + cc-inbox #842 / #843 / #844 for the recalibration methodology.
--
-- Activation: SHIPS IN SHADOW MODE (b67_1_enabled=false). Activate via
--   UPDATE module_constants SET value = 'true'::jsonb
--   WHERE module_name = 'macro_modifier' AND constant_name = 'b67_1_enabled';
-- after 24h soak + Langston Step-7 ack.
--
-- Rollback: 2026-04-28-b67-1-rollback.sql

BEGIN;

INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('macro_modifier', '*', '*', '*', '*', 'b67_1_enabled',
   'false'::jsonb,
   'b67.1-migration'),
  ('macro_modifier', '*', '*', '*', '*', 'b67_1_btc_dominance_weight',
   '0.40'::jsonb,
   'b67.1-migration'),
  ('macro_modifier', '*', '*', '*', '*', 'b67_1_funding_weight',
   '0.35'::jsonb,
   'b67.1-migration'),
  ('macro_modifier', '*', '*', '*', '*', 'b67_1_mcap_momentum_weight',
   '0.25'::jsonb,
   'b67.1-migration'),
  ('macro_modifier', '*', '*', '*', '*', 'b67_1_modifier_min',
   '0.85'::jsonb,
   'b67.1-migration'),
  ('macro_modifier', '*', '*', '*', '*', 'b67_1_modifier_max',
   '1.05'::jsonb,
   'b67.1-migration'),
  ('macro_modifier', '*', '*', '*', '*', 'b67_1_external_feed_cache_seconds',
   '60'::jsonb,
   'b67.1-migration'),
  ('macro_modifier', '*', '*', '*', '*', 'b67_1_external_feed_stale_seconds',
   '300'::jsonb,
   'b67.1-migration'),
  ('macro_modifier', '*', '*', '*', '*', 'b67_1_btc_dominance_zscore_lookback_days',
   '30'::jsonb,
   'b67.1-migration'),
  ('macro_modifier', '*', '*', '*', '*', 'b67_1_funding_zscore_lookback_days',
   '30'::jsonb,
   'b67.1-migration'),
  ('macro_modifier', '*', '*', '*', '*', 'b67_1_zscore_min_sample_count',
   '48'::jsonb,
   'b67.1-migration')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
DO UPDATE SET
  value = EXCLUDED.value,
  updated_by = EXCLUDED.updated_by,
  updated_at = NOW();

COMMIT;

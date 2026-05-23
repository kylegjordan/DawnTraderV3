-- db-migrate:skip
-- B-NEW-43 Phase 2 chunk 4.7 (2026-05-23): bulk skip-marker added. This
-- migration's effects are already captured in 2026-04-22-initial-schema.sql
-- (pg_dump of staging state on 2026-05-23). On a fresh empty Postgres,
-- initial-schema applies the FINAL state; re-running this delta would
-- duplicate-create or otherwise conflict (idempotent ALTER-IF-NOT-EXISTS
-- migrations would no-op but still run unnecessarily; non-idempotent ones
-- would error). Skip-marker ledger-records as applied without running the
-- SQL. See scripts/db-migrate.ts SKIP_MARKER + 1-system-manual/staging-
-- coordination/2026-04-22-initial-schema-mark-applied.sql for the full
-- staging-vs-CI bootstrap divergence model.
-- B68.2 — Volume Regime as second confidence dimension
--
-- Adds accumulation/distribution as orthogonal signal to the price-derived
-- regime classifier per master plan §5.4 #4. Mirrors B67.4 / B68.4 chain
-- factor pattern: pure-function score over rolling OHLC + narrow-band
-- confidence factor + ablation row.
--
-- §D.1 (Langston cc-inbox #880): liquidation-spike metadata flag.
-- §D.2 (Langston cc-inbox #881): promote liquidation-spike multiplier to
--      module_constant from v1 (was v1-hardcoded in original scope).
--
-- Modulation chain after this batch:
--   raw × macro × phase_weight × freshness × outcome × volume_regime
--     → clamp [0.4, 1.0]
--
-- Score formula (volume-regime.ts):
--   score = SUM(volume[i] × sign(close[i] - close[i-1])) / SUM(volume[i])
--   factor = clamp(min, max, 1.0 + score × sensitivity)
--   has_liquidation_spike = any single-bar volume > multiplier × median(volumes)
--
-- Seed values:
--   b68_2_lookback_bars                = 30   — matches HF7 momentum lookback
--   b68_2_accumulation_threshold       = 0.40 — informational metadata label
--   b68_2_distribution_threshold       = -0.40
--   b68_2_factor_min                   = 0.92
--   b68_2_factor_max                   = 1.05
--   b68_2_sensitivity                  = 0.05 — narrow band per Langston B.4
--   b68_2_min_samples                  = 30   — cold-start floor
--   b68_2_liquidation_spike_multiplier = 5.0  — single-bar volume > 5× median

BEGIN;

INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('volume_regime', '*', '*', '*', '*', 'b68_2_lookback_bars',                '30'::jsonb,    'b68.2-volume-regime'),
  ('volume_regime', '*', '*', '*', '*', 'b68_2_accumulation_threshold',       '0.40'::jsonb,  'b68.2-volume-regime'),
  ('volume_regime', '*', '*', '*', '*', 'b68_2_distribution_threshold',      '-0.40'::jsonb,  'b68.2-volume-regime'),
  ('volume_regime', '*', '*', '*', '*', 'b68_2_factor_min',                   '0.92'::jsonb,  'b68.2-volume-regime'),
  ('volume_regime', '*', '*', '*', '*', 'b68_2_factor_max',                   '1.05'::jsonb,  'b68.2-volume-regime'),
  ('volume_regime', '*', '*', '*', '*', 'b68_2_sensitivity',                  '0.05'::jsonb,  'b68.2-volume-regime'),
  ('volume_regime', '*', '*', '*', '*', 'b68_2_min_samples',                  '30'::jsonb,    'b68.2-volume-regime'),
  ('volume_regime', '*', '*', '*', '*', 'b68_2_liquidation_spike_multiplier', '5.0'::jsonb,   'b68.2-volume-regime')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
DO UPDATE SET
  value = EXCLUDED.value,
  updated_by = EXCLUDED.updated_by,
  updated_at = NOW();

COMMIT;

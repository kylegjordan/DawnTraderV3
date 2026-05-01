-- B67.4 — Cheap-tier bundle: outcome feedback + regime age + Path B sustainability
--
-- Three small complementary levers shipping in one commit per BATCH_67_4_SCOPE.md
-- §A/B/C, with §D refinements from Langston cc-inbox #857 folded in:
--   §D.1 — 7d expiry on OutcomeFeedbackStore (added b67_4_expiry_hours = 168)
--   §D.5 — total of 11 module_constants (was 10)
--
-- Modules (3 new):
--   outcome_feedback        — B67.4 EMA on per-(regime, strategy) net P&L
--   regime_age              — B68.4 freshness factor from regimePhaseStore age
--   path_b_sustainability   — B68.5 DBS-slope gate on TFS Path B (DBS-strength only)
--
-- Modulation chain after this batch:
--   raw × macro × phase_weight × freshness × outcome_feedback → clamp [0.4, 1.0]
--
-- Seed values (BATCH_67_4_SCOPE.md §D + BATCH_67_4_PRE_AUDIT.md §B.2):
--   b67_4_alpha             = 0.10  — EMA decay, ~10-trade half-life
--   b67_4_sensitivity       = 4.0   — 1% EMA P&L → 0.04 factor delta
--   b67_4_min_samples       = 5     — cold-start floor
--   b67_4_factor_min        = 0.85
--   b67_4_factor_max        = 1.05
--   b67_4_expiry_hours      = 168   — 7-day disk-load expiry per §D.1
--   b68_4_target_age_hours  = 6.0   — middle of PRIME band
--   b68_4_sensitivity       = 0.10  — slope of factor vs age
--   b68_4_min               = 0.92
--   b68_4_max               = 1.05
--   b68_5_dbs_slope_min     = 0.0   — non-negative slope to admit Path B (TFS-scoped)
--
-- Recalibration: all values are DB-tunable post-deploy; no code redeploy needed.

BEGIN;

INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('outcome_feedback', '*', '*', '*', '*', 'b67_4_alpha',
   '0.10'::jsonb, 'b67.4-cheap-tier'),
  ('outcome_feedback', '*', '*', '*', '*', 'b67_4_sensitivity',
   '4.0'::jsonb, 'b67.4-cheap-tier'),
  ('outcome_feedback', '*', '*', '*', '*', 'b67_4_min_samples',
   '5'::jsonb, 'b67.4-cheap-tier'),
  ('outcome_feedback', '*', '*', '*', '*', 'b67_4_factor_min',
   '0.85'::jsonb, 'b67.4-cheap-tier'),
  ('outcome_feedback', '*', '*', '*', '*', 'b67_4_factor_max',
   '1.05'::jsonb, 'b67.4-cheap-tier'),
  ('outcome_feedback', '*', '*', '*', '*', 'b67_4_expiry_hours',
   '168'::jsonb, 'b67.4-cheap-tier'),
  ('regime_age', '*', '*', '*', '*', 'b68_4_target_age_hours',
   '6.0'::jsonb, 'b67.4-cheap-tier'),
  ('regime_age', '*', '*', '*', '*', 'b68_4_sensitivity',
   '0.10'::jsonb, 'b67.4-cheap-tier'),
  ('regime_age', '*', '*', '*', '*', 'b68_4_min',
   '0.92'::jsonb, 'b67.4-cheap-tier'),
  ('regime_age', '*', '*', '*', '*', 'b68_4_max',
   '1.05'::jsonb, 'b67.4-cheap-tier'),
  ('path_b_sustainability', '*', '*', '*', 'TREND_FRIENDLY_STABLE', 'b68_5_dbs_slope_min',
   '0.0'::jsonb, 'b67.4-cheap-tier')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
DO UPDATE SET
  value = EXCLUDED.value,
  updated_by = EXCLUDED.updated_by,
  updated_at = NOW();

COMMIT;

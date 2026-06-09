-- ITEM-4 Phase B step 2 (2026-06-10) — per-source calibration epochs (v0)
-- D9 anti-mixing stamp for the labeled multi-source learning substrate
-- (Gate-2 design B.7 #4 + Langston step-2 amendments: manual-but-MANDATORY
-- bump via the canonical module_constants write path; bump-scope rule:
-- a change scoped to ONE source bumps that source; a SHARED-substrate change
-- (MCE math, SQE thresholds, regime-map, shared strategy constants) bumps ALL.
-- Enforcement: every calibration-batch completion report carries the bump or
-- an explicit "no calibration impact" line — checked at Step 4/Step 8).
-- Read sync via the warmed B72 cache ('calibration_epoch' in PREFETCH_MODULES);
-- missing row = hard-fail at read (no silent fallback).
--
-- Rollback: DELETE FROM module_constants WHERE module_name = 'calibration_epoch';

INSERT INTO module_constants (
  module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by
) VALUES
  ('calibration_epoch', '*', '*', '*', '*', 'vts',       '1'::jsonb, 'item4-step2'),
  ('calibration_epoch', '*', '*', '*', '*', 'paper_sim', '1'::jsonb, 'item4-step2'),
  ('calibration_epoch', '*', '*', '*', '*', 'live',      '1'::jsonb, 'item4-step2')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
DO NOTHING;

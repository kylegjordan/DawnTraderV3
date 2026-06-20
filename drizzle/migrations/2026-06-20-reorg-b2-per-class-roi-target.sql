-- P19 reorg-B2 (2026-06-20) — per-class ROI gate + target floor + min-RR.
--
-- Piece B makes the ROI gate PER CLASS (was a single global '*' row, shared by crypto +
-- xStock + VTS via the shared isSignalProfitable). Piece A adds the per-class target-floor
-- (`target_floor_pct`) + minimum reward-to-risk (`min_rr`) the central normalizer injects.
--
-- Values (CONSERVATIVE seed; Phase-25 calibrates the per-class differentiation):
--   - target_floor_pct = 0.040 (4%): the lifted target clears the ~1.66% Tier-1 taker
--     friction wall ((0.008*2)+(0.0005*1.1)) AND the ROI-gate ceiling (roi_absolute_max),
--     so a floored signal actually OPENS. Langston's asymmetric-stop math: floor 3.5%, prefer 4%.
--   - roi_absolute_min/max = 0.015 / 0.040, roi_flex = 0.6 (carried from the global seed).
--   - min_rr = 2.5 (RR ≥ 2.5; the normalizer DROPS sub-RR, never co-moves the stop).
--   - roi_gating.min_roi per regime = the existing global per-regime values, copied per class.
-- crypto_spot == xstock_spot today (account-wide Tier-1 fee wall is identical, per B-4.5).
--
-- Then DELETE the now-superseded global '*' ROI rows (Langston: no silent global fallback;
-- §15 lingering-legacy). friction_safety_buffer '*' is KEPT (class-agnostic slippage margin).
--
-- Boot assertion (server/startup/b72-warmup.ts) asserts the per-class rows exist for both
-- active classes → a missing row is a deterministic DEPLOY-time failure, never a silent default.
-- Rollback: 2026-06-20-reorg-b2-per-class-roi-target-rollback.sql (operator-only).

-- ── expectancy_gates per-class (crypto_spot + xstock_spot) ──────────────────────────────
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('expectancy_gates','*','crypto_spot','*','*','roi_flex_multiplier','0.6'::jsonb,'reorg-b2'),
  ('expectancy_gates','*','crypto_spot','*','*','roi_absolute_min','0.015'::jsonb,'reorg-b2'),
  ('expectancy_gates','*','crypto_spot','*','*','roi_absolute_max','0.040'::jsonb,'reorg-b2'),
  ('expectancy_gates','*','crypto_spot','*','*','target_floor_pct','0.040'::jsonb,'reorg-b2'),
  ('expectancy_gates','*','crypto_spot','*','*','min_rr','2.5'::jsonb,'reorg-b2'),
  ('expectancy_gates','*','xstock_spot','*','*','roi_flex_multiplier','0.6'::jsonb,'reorg-b2'),
  ('expectancy_gates','*','xstock_spot','*','*','roi_absolute_min','0.015'::jsonb,'reorg-b2'),
  ('expectancy_gates','*','xstock_spot','*','*','roi_absolute_max','0.040'::jsonb,'reorg-b2'),
  ('expectancy_gates','*','xstock_spot','*','*','target_floor_pct','0.040'::jsonb,'reorg-b2'),
  ('expectancy_gates','*','xstock_spot','*','*','min_rr','2.5'::jsonb,'reorg-b2')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
  DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by;

-- ── roi_gating per-class per-regime (copy the existing global values, both classes) ──────
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('roi_gating','*','crypto_spot','*','TREND_FRIENDLY_STABLE','min_roi','0.0125'::jsonb,'reorg-b2'),
  ('roi_gating','*','crypto_spot','*','HIGH_VOLATILITY_UNSTABLE','min_roi','0.0250'::jsonb,'reorg-b2'),
  ('roi_gating','*','crypto_spot','*','RANGE_BOUND_STABLE','min_roi','0.0175'::jsonb,'reorg-b2'),
  ('roi_gating','*','crypto_spot','*','IMPULSE_EXPANSION','min_roi','0.0300'::jsonb,'reorg-b2'),
  ('roi_gating','*','crypto_spot','*','STRUCTURAL_TRANSITION','min_roi','0.0200'::jsonb,'reorg-b2'),
  ('roi_gating','*','xstock_spot','*','TREND_FRIENDLY_STABLE','min_roi','0.0125'::jsonb,'reorg-b2'),
  ('roi_gating','*','xstock_spot','*','HIGH_VOLATILITY_UNSTABLE','min_roi','0.0250'::jsonb,'reorg-b2'),
  ('roi_gating','*','xstock_spot','*','RANGE_BOUND_STABLE','min_roi','0.0175'::jsonb,'reorg-b2'),
  ('roi_gating','*','xstock_spot','*','IMPULSE_EXPANSION','min_roi','0.0300'::jsonb,'reorg-b2'),
  ('roi_gating','*','xstock_spot','*','STRUCTURAL_TRANSITION','min_roi','0.0200'::jsonb,'reorg-b2')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
  DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by;

-- ── DELETE the now-superseded global '*' ROI rows (no silent global fallback) ────────────
DELETE FROM module_constants
  WHERE module_name='expectancy_gates' AND asset_class='*'
    AND constant_name IN ('roi_flex_multiplier','roi_absolute_min','roi_absolute_max');
DELETE FROM module_constants
  WHERE module_name='roi_gating' AND asset_class='*' AND constant_name='min_roi';
-- NOTE: expectancy_gates.friction_safety_buffer '*' is intentionally KEPT (class-agnostic).

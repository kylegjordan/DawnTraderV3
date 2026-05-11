-- B79.0m.a — xstock_spot regime classifier asset-class-explicit rows.
--
-- Only seeding the volatility/momentum-sensitive thresholds where crypto-tuned
-- values would mis-classify equity microstructure (equity ATR ~0.5-2% vs crypto
-- 2-8%). Wildcard rows retained for asset-class-agnostic primitives
-- (directional_integrity formula, dbs_calculation, regime_age math) — those
-- math primitives are scale-free.
--
-- Tagged updated_by='b79.0m.a-layer1-starter-halved-from-crypto' for greppable
-- audit trail. Layer-3 calibrates from xstock VTS evidence post-wire.

BEGIN;

-- B67.3.5 TFS-branch regime classifier scales (B62-era confidence-shift inputs)
-- Crypto: momentum 0.020 / volatility 0.025 → Xstock: halved per equity-ATR baseline
INSERT INTO module_constants
  (module_name, constant_name, value, asset_class, exchange, regime, strategy, updated_at, updated_by)
VALUES
  ('regime_classifier', 'b67_3_5_tfs_momentum_scale',   '0.010'::jsonb, 'xstock_spot', '*', 'TREND_FRIENDLY_STABLE', '*', NOW(), 'b79.0m.a-layer1-starter-halved-from-crypto'),
  ('regime_classifier', 'b67_3_5_tfs_volatility_scale', '0.0125'::jsonb, 'xstock_spot', '*', 'TREND_FRIENDLY_STABLE', '*', NOW(), 'b79.0m.a-layer1-starter-halved-from-crypto'),
  -- DBS scale and desat min/max are regime-shape parameters, scale-free
  -- → KEEP WILDCARD with justification (no row inserted; comment-only)

  -- B68.5 Path B sustainability momentum floor: crypto 0.001 → xstock 0.0005
  ('path_b_sustainability', 'b68_5_path_b_momentum_min', '0.0005'::jsonb, 'xstock_spot', '*', 'TREND_FRIENDLY_STABLE', '*', NOW(), 'b79.0m.a-layer1-starter-halved-from-crypto')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- Wildcard-KEEP modules (math is asset-class-agnostic — documented inline in
-- module ownership notes):
--   directional_integrity         — geometric path-linearity score
--   dbs_calculation               — DBS formula primitive
--   regime_age                    — age math is unit-relative
--   multi_tf_agreement            — agreement is regime-relative not absolute
--   outcome_feedback              — EMA on prior outcomes is unit-free
--   pair_correlation              — Spearman/Pearson is scale-free
--   volume_regime                 — volume math is regime-relative
--   regime_phase                  — phase math is duration-based not volatility-based

COMMIT;

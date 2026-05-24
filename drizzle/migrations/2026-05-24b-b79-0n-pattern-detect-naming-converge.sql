-- B79.0n.PATTERN-DETECT — Pattern-pool gates naming convergence + RSI seed (2026-05-24).
--
-- Step 3 chunk A. Closes the F-2 lever naming drift on
-- module_constants.pattern_pool_gates.xstock_spot.* rows. The xstock seeds
-- shipped in 2026-05-07-b79-xstock-module-constants.sql used divergent names
-- (final_score_floor / max_position_pct) from the crypto-side convention
-- (pattern_final_score_min / pattern_max_position_pct). Per-class scoping
-- belongs on the asset_class column, not on the constant_name column.
--
-- Operations (3 in one BEGIN/COMMIT, idempotent — safe to re-run):
--   1. UPDATE xstock_spot.final_score_floor -> pattern_final_score_min
--   2. UPDATE xstock_spot.max_position_pct  -> pattern_max_position_pct
--   3. INSERT pattern_rsi_min=15 + pattern_rsi_max=85 (crypto defaults
--      cloned per Langston Q-C Option (a); Layer-3 xstock calibration TBD)
--
-- Crypto path NONE-by-construction — only xstock_spot rows touched.
--
-- Langston pre-audit §-0 Q-B grep cross-check VERIFIED zero production
-- consumers of the legacy row names today, so no transitional alias is
-- required. The xstock_spot/pattern-pool-filters.ts file rewrite under
-- chunk D adopts the converged crypto-side naming directly via
-- getCachedNumberRequired lookups.

BEGIN;

-- (1) Rename: final_score_floor -> pattern_final_score_min
UPDATE module_constants
   SET constant_name = 'pattern_final_score_min',
       updated_by    = 'B79.0n.PATTERN-DETECT_naming_converge',
       updated_at    = NOW()
 WHERE module_name   = 'pattern_pool_gates'
   AND exchange      = '*'
   AND asset_class   = 'xstock_spot'
   AND strategy      = '*'
   AND regime        = '*'
   AND constant_name = 'final_score_floor';

-- (2) Rename: max_position_pct -> pattern_max_position_pct
UPDATE module_constants
   SET constant_name = 'pattern_max_position_pct',
       updated_by    = 'B79.0n.PATTERN-DETECT_naming_converge',
       updated_at    = NOW()
 WHERE module_name   = 'pattern_pool_gates'
   AND exchange      = '*'
   AND asset_class   = 'xstock_spot'
   AND strategy      = '*'
   AND regime        = '*'
   AND constant_name = 'max_position_pct';

-- (3) Seed xstock_spot RSI bounds (clone crypto defaults; Layer-3 calibration TBD)
INSERT INTO module_constants
  (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
VALUES
  ('pattern_pool_gates', '*', 'xstock_spot', '*', '*', 'pattern_rsi_min', '15'::jsonb, 'B79.0n.PATTERN-DETECT_clone_crypto_default'),
  ('pattern_pool_gates', '*', 'xstock_spot', '*', '*', 'pattern_rsi_max', '85'::jsonb, 'B79.0n.PATTERN-DETECT_clone_crypto_default')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
  DO NOTHING;  -- preserve any pre-existing manually-tuned value if re-run

COMMIT;

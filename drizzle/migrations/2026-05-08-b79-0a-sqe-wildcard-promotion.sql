-- ════════════════════════════════════════════════════════════════════════════
-- B79.0a Migration 2 — SQE wildcard per-class promotion (N2 cleanup)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Promotes the 2 sqe_config wildcard rows (min_final_score, min_regime_weight)
-- to explicit per-class rows for crypto_spot + xstock_spot. The wildcard
-- rows REMAIN preserved for now; B79.0b (after 48h verify gate) DELETEs
-- them — same two-step pattern as B79.TEC + B79.TEC.b.
--
-- All other SQE/pattern_pool keys already have explicit per-class rows
-- from B79 ship (verified via live psql 2026-05-08).
--
-- Per Langston rev 1 #3: value-comparison assertion explicit in SQL —
-- migration fails loudly if pre-existing operator override doesn't match
-- the current wildcard value (manual review required).
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

INSERT INTO module_constants
  (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
VALUES
  -- min_final_score per-class promotion (wildcard 0.35 preserved)
  ('sqe_config', '*', 'crypto_spot', '*', '*', 'min_final_score', '0.35'::jsonb, 'B79.0a'),
  ('sqe_config', '*', 'xstock_spot', '*', '*', 'min_final_score', '0.35'::jsonb, 'B79.0a'),
  -- min_regime_weight per-class promotion (wildcard 0.30 preserved)
  ('sqe_config', '*', 'crypto_spot', '*', '*', 'min_regime_weight', '0.30'::jsonb, 'B79.0a'),
  ('sqe_config', '*', 'xstock_spot', '*', '*', 'min_regime_weight', '0.30'::jsonb, 'B79.0a')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- Langston rev 1 #3: explicit value-comparison assertion in SQL.
DO $$
DECLARE
  wildcard_min_final_score jsonb;
  wildcard_min_regime_weight jsonb;
  expected_count int := 4;
  actual_count int;
BEGIN
  SELECT value INTO wildcard_min_final_score FROM module_constants
   WHERE module_name='sqe_config' AND asset_class='*' AND constant_name='min_final_score';
  SELECT value INTO wildcard_min_regime_weight FROM module_constants
   WHERE module_name='sqe_config' AND asset_class='*' AND constant_name='min_regime_weight';

  SELECT COUNT(*) INTO actual_count FROM module_constants
   WHERE module_name='sqe_config'
     AND asset_class IN ('crypto_spot', 'xstock_spot')
     AND constant_name IN ('min_final_score', 'min_regime_weight')
     AND ((constant_name='min_final_score' AND value=wildcard_min_final_score)
       OR (constant_name='min_regime_weight' AND value=wildcard_min_regime_weight));

  IF actual_count != expected_count THEN
    RAISE EXCEPTION 'B79.0a Migration 2 assertion failed: expected % matching rows, found %. Pre-existing override may exist; manual review required.', expected_count, actual_count;
  END IF;
END $$;

COMMIT;

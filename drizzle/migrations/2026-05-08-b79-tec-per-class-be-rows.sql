-- ════════════════════════════════════════════════════════════════════════════
-- B79.TEC — Per-asset-class break_even_enabled rows (Migration 1)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Seeds an explicit row for every ACTIVE asset class so primeTECConfig() at
-- boot can resolve the per-class kill-switch without falling back to the
-- (*,*,*,*) wildcard. The wildcard row remains in place during this migration
-- as a safety net; it is removed in a separate B79.TEC.b deploy after a 48h
-- verification gate (see scripts/b79-tec-remove-wildcard-be-row.sql).
--
-- ON CONFLICT DO NOTHING (per Langston scope rev 2 Risk 9): silent overwrite
-- of a pre-existing manual experimental value would be lossy. The post-INSERT
-- assertion fails LOUDLY if any of the 4 expected rows is missing OR has a
-- value other than `false`. Operators set an intentional override?
-- The migration fails — they decide explicitly: keep the override or delete
-- it and re-run.
--
-- ACTIVE asset classes (from shared/asset-classes.ts getActiveAssetClasses()):
--   crypto_spot, crypto_perp, xstock_spot, xstock_perp
--
-- All four start with break_even_enabled=false:
--   - crypto_spot:  Variant K winner (B73 ablation, Sharpe 2.13 vs J's 0.39)
--   - crypto_perp:  Day-1 default; flips after dedicated ablation evidence
--   - xstock_spot:  Day-1 default; flips after B79.4 ablation (RUNNING_ISSUES #80)
--   - xstock_perp:  Day-1 default; flips after dedicated ablation evidence
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

INSERT INTO module_constants
  (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
VALUES
  ('trailing_exit', '*', 'crypto_spot',  '*', '*', 'break_even_enabled', 'false'::jsonb, 'B79.TEC'),
  ('trailing_exit', '*', 'crypto_perp',  '*', '*', 'break_even_enabled', 'false'::jsonb, 'B79.TEC'),
  ('trailing_exit', '*', 'xstock_spot',  '*', '*', 'break_even_enabled', 'false'::jsonb, 'B79.TEC'),
  ('trailing_exit', '*', 'xstock_perp',  '*', '*', 'break_even_enabled', 'false'::jsonb, 'B79.TEC')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
  DO NOTHING;

-- Post-INSERT assertion: all 4 rows exist AND value = false.
-- If a row pre-existed with a different value, this fails with a descriptive
-- error that names the conflict explicitly so the operator can decide.
DO $$
DECLARE
  expected_count int := 4;
  actual_false_count int;
  conflict_rows text;
BEGIN
  SELECT COUNT(*) INTO actual_false_count
    FROM module_constants
   WHERE module_name = 'trailing_exit'
     AND constant_name = 'break_even_enabled'
     AND asset_class IN ('crypto_spot', 'crypto_perp', 'xstock_spot', 'xstock_perp')
     AND value = 'false'::jsonb;

  IF actual_false_count != expected_count THEN
    SELECT string_agg(asset_class || '=' || value::text, ', ')
      INTO conflict_rows
      FROM module_constants
     WHERE module_name = 'trailing_exit'
       AND constant_name = 'break_even_enabled'
       AND asset_class IN ('crypto_spot', 'crypto_perp', 'xstock_spot', 'xstock_perp');
    RAISE EXCEPTION
      'B79.TEC migration assertion failed: expected % rows with value=false for ACTIVE asset classes, found %. Current rows: %. A pre-existing intentional override may exist; manual review required.',
      expected_count, actual_false_count, COALESCE(conflict_rows, '<none>');
  END IF;
END $$;

COMMIT;

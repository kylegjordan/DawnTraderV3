-- =====================================================================
-- B79.0n.MCE — dbs_calculation per-asset-class seed migration ROLLBACK
-- =====================================================================
-- Companion rollback for 2026-05-22-b79-0n-mce-dbs-per-class.sql.
--
-- NOT auto-run by deploy. Execute manually only if Step 7 verification of
-- B79.0n.MCE fails post-deploy and the migration must be reverted.
--
-- Restores the single wildcard (*,*,*,*) row for
-- dbs_calculation.min_sample_count (value 20) and removes the two
-- class-scoped rows the forward migration added.
--
-- Idempotent: ON CONFLICT DO NOTHING on the re-insert; the DELETE is a
-- no-op if the class-scoped rows are already gone.
--
-- NOTE: this rollback assumes the forward migration's value was 20 (the
-- B72-seeded wildcard value). If a Phase 19 calibration has since changed
-- the crypto_spot value, DO NOT blind-rollback — reconcile manually.
-- =====================================================================

BEGIN;

-- Re-insert the wildcard row (value 20 — the B72-seeded original).
INSERT INTO module_constants
  (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
VALUES
  ('dbs_calculation', '*', '*', '*', '*', 'min_sample_count', '20'::jsonb, 'b79-0n-mce-rollback')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- Remove the two class-scoped rows added by the forward migration.
DELETE FROM module_constants
WHERE module_name = 'dbs_calculation'
  AND constant_name = 'min_sample_count'
  AND asset_class IN ('crypto_spot', 'xstock_spot');

COMMIT;

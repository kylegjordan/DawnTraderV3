-- ════════════════════════════════════════════════════════════════════════════
-- B79.0a — SQE wildcard row DELETE (Step 2 of two-step gate)
-- ════════════════════════════════════════════════════════════════════════════
--
-- DO NOT EXECUTE in B79.0b's Step 6 deploy. This script runs as a separate
-- mini-deploy AFTER a 48h verification gate (see
-- `Claude Comms and Packages/Scope Files/BATCH_79_0b_VERIFY_CHECKLIST.md`).
--
-- B79.0a Migration 2 promoted 2 sqe_config wildcard rows to explicit per-class
-- rows for crypto_spot + xstock_spot:
--   - sqe_config.min_final_score (wildcard 0.35 → per-class 0.35 each)
--   - sqe_config.min_regime_weight (wildcard 0.30 → per-class 0.30 each)
--
-- The wildcards remained in place during a 48h observation window so the
-- module_constants resolution path could be observed flowing through the
-- explicit per-class rows. After 48h clean, this script removes the now-
-- redundant wildcards.
--
-- Mirror of B79.TEC.b pattern — committed-not-executed; manual operator
-- step at +48h gate (2026-05-10 21:38 UTC, 48h after B79.0a Migration 2
-- applied at 2026-05-08 21:38 UTC).
--
-- Idempotent + signature-guarded:
--   - Pre-check `SELECT COUNT(*) = 2` (assert, abort if 0/1/3+)
--   - Capture rows for rollback (operator copies result before DELETE)
--   - Signature WHERE includes `value`, `asset_class='*'`, `created_at <
--     <STEP1_DEPLOY_TIMESTAMP>` so a freshly-inserted wildcard (post-deploy)
--     cannot be accidentally targeted.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Capture for rollback (manual operator step — copy result before DELETE)
SELECT
  'CAPTURED_FOR_ROLLBACK: ' AS marker,
  module_name, exchange, asset_class, strategy, regime,
  constant_name, value, updated_by, created_at
FROM module_constants
 WHERE module_name = 'sqe_config'
   AND asset_class = '*'
   AND constant_name IN ('min_final_score', 'min_regime_weight')
 ORDER BY constant_name;

-- 2. Pre-check: exactly 2 wildcard rows match the signature
DO $$
DECLARE row_count int;
BEGIN
  SELECT COUNT(*) INTO row_count FROM module_constants
   WHERE module_name = 'sqe_config'
     AND asset_class = '*'
     AND constant_name IN ('min_final_score', 'min_regime_weight');
  IF row_count != 2 THEN
    RAISE EXCEPTION 'B79.0a wildcard-DELETE precheck failed: expected exactly 2 wildcard rows, found %. Manual review required.', row_count;
  END IF;
END $$;

-- 3. Signature-guarded DELETE
-- Replace <STEP1_DEPLOY_TIMESTAMP> with B79.0a Migration 2 application
-- timestamp before running. Format: '2026-05-08 21:38:00+00'::timestamptz
DELETE FROM module_constants
 WHERE module_name = 'sqe_config'
   AND asset_class = '*'
   AND constant_name IN ('min_final_score', 'min_regime_weight')
   AND created_at < '<STEP1_DEPLOY_TIMESTAMP>'::timestamptz;

COMMIT;

-- ─── ROLLBACK RECIPE ─────────────────────────────────────────────────────────
-- If something breaks AFTER the DELETE:
--
-- BEGIN;
-- INSERT INTO module_constants
--   (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
-- VALUES
--   ('sqe_config', '<captured exchange>', '*', '<captured strategy>', '<captured regime>',
--    'min_final_score', '<captured value>'::jsonb, 'B79.0b_rollback'),
--   ('sqe_config', '<captured exchange>', '*', '<captured strategy>', '<captured regime>',
--    'min_regime_weight', '<captured value>'::jsonb, 'B79.0b_rollback');
-- COMMIT;
--
-- Use the captured rows from step 1 above to fill the angle-brackets.
-- ─────────────────────────────────────────────────────────────────────────────

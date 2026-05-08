-- ════════════════════════════════════════════════════════════════════════════
-- B79.TEC.b — Remove wildcard break_even_enabled row (Step 2 of two-step gate)
-- ════════════════════════════════════════════════════════════════════════════
--
-- DO NOT EXECUTE in B79.TEC's Step 6 deploy. This script runs as a separate
-- mini-deploy AFTER a 48h verification gate (see
-- `Claude Comms and Packages/Scope Files/BATCH_79_TEC_b_VERIFY_CHECKLIST.md`).
--
-- Preconditions (operator MUST verify before executing):
--   1. >= 48h elapsed since B79.TEC's Step 6 deploy timestamp.
--   2. PM2 logs show ZERO `[TEC_FIRST_WILDCARD_HIT]` events for any of the
--      4 active asset classes since the deploy:
--         pm2 logs dawntrader --lines 100000 --nostream | grep TEC_FIRST_WILDCARD_HIT
--   3. `[TEC_RESOLVE_AGGR]` per-minute dumps show ZERO `wildcard:N` entries
--      with N>0 for crypto_spot, crypto_perp, xstock_spot, xstock_perp:
--         pm2 logs dawntrader --lines 100000 --nostream | grep TEC_RESOLVE_AGGR | grep -E 'wildcard:[1-9]'
--   4. /api/diagnostics/tec-bootstrap returns ready=true with all 4 classes
--      ready=true.
--
-- If ANY precondition fails, STOP and diagnose. Do NOT execute the DELETE.
--
-- The wildcard row is ALSO present today as the original B65.1 seed
-- (created 2026-04-23 with value='true'). Migration 1 added explicit
-- per-class rows with value=false; per the most-specific-wins precedence
-- logic in module_constants-service.ts, the per-class rows override the
-- wildcard automatically. This script removes the wildcard so:
--   - Future cache-miss paths cannot silently inherit the old `true` default
--   - The DB reflects the new architectural truth (per-class only)
--
-- Idempotent: re-running after the row is gone is a no-op (DELETE 0 rows).
-- Signature-guarded: WHERE clause includes value, asset_class, and
-- created_at < <STEP1_DEPLOY_TIMESTAMP> so a fresh manual experimental
-- wildcard row (post-deploy) cannot be accidentally targeted.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Capture for rollback (manual operator step — copy result before DELETE)
SELECT
  'CAPTURED_FOR_ROLLBACK: ' AS marker,
  module_name, exchange, asset_class, strategy, regime,
  constant_name, value, updated_by, created_at
FROM module_constants
 WHERE module_name = 'trailing_exit'
   AND asset_class = '*'
   AND constant_name = 'break_even_enabled';

-- 2. Pre-check: exactly 1 row matches signature
DO $$
DECLARE row_count int;
BEGIN
  SELECT COUNT(*) INTO row_count FROM module_constants
   WHERE module_name = 'trailing_exit'
     AND asset_class = '*'
     AND constant_name = 'break_even_enabled';
  IF row_count != 1 THEN
    RAISE EXCEPTION 'B79.TEC.b precheck failed: expected exactly 1 wildcard row for break_even_enabled, found %. Manual review required before DELETE.', row_count;
  END IF;
END $$;

-- 3. Signature-guarded DELETE.
-- The created_at clause defends against a fresh manual experimental row
-- inserted post-Migration-1; replace <STEP1_DEPLOY_TIMESTAMP> with the
-- actual B79.TEC Step 6 deploy timestamp (UTC) before running.
-- Format: '2026-05-08 21:30:00+00'::timestamptz
DELETE FROM module_constants
 WHERE module_name = 'trailing_exit'
   AND asset_class = '*'
   AND constant_name = 'break_even_enabled'
   AND created_at < '<STEP1_DEPLOY_TIMESTAMP>'::timestamptz;

COMMIT;

-- ─── ROLLBACK RECIPE ─────────────────────────────────────────────────────────
-- If something breaks after the DELETE:
--
-- BEGIN;
-- INSERT INTO module_constants
--   (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
-- VALUES
--   ('trailing_exit', '<captured exchange>', '*', '<captured strategy>', '<captured regime>',
--    'break_even_enabled', '<captured value>'::jsonb, 'B79.TEC.b_rollback');
-- COMMIT;
--
-- Use the captured row from step 1 above to fill the angle-brackets.
-- ─────────────────────────────────────────────────────────────────────────────

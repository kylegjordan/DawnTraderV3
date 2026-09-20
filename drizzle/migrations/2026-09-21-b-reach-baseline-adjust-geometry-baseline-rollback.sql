-- ROLLBACK for 2026-09-21-b-reach-baseline-adjust-geometry-baseline.sql (B-REACH-BASELINE-ADJUST, 3n.v)
--
-- ⛔⛔⛔ THE ORDER IS SQL FIRST, THEN THE CODE — AND THE OBVIOUS ORDER TAKES THE SIGNAL PATH DOWN.
-- (Langston BLOCKER-2, Step 4. The header previously said "code first, then this" and that is WRONG.)
-- The standard rollback here is "deploy the previous sha". PREVIOUS-SHA CODE READS `target_floor_pct`
-- FIRST AND UNCONDITIONALLY in `getPerClassTargetGate`, and the forward migration DELETED both rows.
-- ⇒ deploying the old code before running this SQL makes `getCachedNumberRequired` THROW ON EVERY GATE
-- CALL — `signal-orchestrator.ts:1908`, `vts-runner.ts:1787`, `xstock_spot/eval-cycle.ts:722`, plus the
-- boot assertion list. BOTH CLASSES, BOTH LANES. That is the forward migration's own deletion argument
-- pointed backwards.
-- ✅ CORRECT ORDER: (1) run THIS FILE, which re-seeds `target_floor_pct`; (2) THEN deploy the previous
-- sha. Running this while the NEW code is still deployed is harmless — the restored rows are simply
-- unread — so there is no window in which either half is unsafe, provided the SQL goes first.
--
-- ⭐ THE PRE-REGISTERED ROLLBACK TRIGGER (written before the deploy, pre-audit A-7): within 7 days of
-- the deploy, EITHER strong_bull_trend exceeds 25% of all active-path signal ADMISSIONS on its class,
-- OR the active pool's realised 7-day P&L on that class falls more than 2 percentage points below its
-- pre-deploy 7-day figure. Both are readable without new instrumentation.
--
-- RESTORES THE EXACT PRE-BATCH STATE, and the arithmetic is stated rather than summarised, because
-- "restores all six" (an earlier draft) is the wrong count for what this has to undo:
--   • DROP the 5 rows the batch CREATED — reach_atr_max for strong_bull_trend x2 and for
--     xstock_spot/vwap_pullback, min_rr for xstock_spot/strong_bull_trend and crypto_spot/vwap_bounce.
--     They are DELETED, not reset: they did not exist before.
--   • RESTORE the 1 row the batch CHANGED — crypto_spot/vwap_pullback min_rr back to its June-derived
--     2.44. The forward migration preserves that old value NOWHERE, so it is hardcoded here.
--   • RE-INSERT the 2 rows the batch DELETED — target_floor_pct, both classes, at their 2026-06-20
--     value of 0.040. Same point: the forward migration preserves those values nowhere either.
-- ⇒ 5 dropped + 1 restored + 2 re-inserted. The three old values this file hardcodes (2.44, 0.040,
-- 0.040) are the ONLY record of them anywhere in the batch.

BEGIN;

-- 1. the THREE reach ceilings this batch created (two strong_bull_trend, plus the xStock
--    vwap_pullback row Langston's Step-4 BLOCKER-1 reversed back into the batch)
DELETE FROM module_constants
 WHERE module_name='expectancy_gates' AND constant_name='reach_atr_max'
   AND (   (strategy='strong_bull_trend' AND asset_class IN ('crypto_spot','xstock_spot'))
        OR (strategy='vwap_pullback'     AND asset_class='xstock_spot'));

-- 2. the two min_rr rows this batch created (they had NO row before — deletion, not a reset)
DELETE FROM module_constants
 WHERE module_name='expectancy_gates' AND constant_name='min_rr'
   AND (   (asset_class='xstock_spot' AND strategy='strong_bull_trend')
        OR (asset_class='crypto_spot' AND strategy='vwap_bounce'));

-- 3. the one min_rr row this batch CHANGED goes back to its reorg-B2.3 value
UPDATE module_constants
   SET value='2.44'::jsonb, updated_at=NOW(), updated_by='b-reach-baseline-adjust-rollback'
 WHERE module_name='expectancy_gates' AND constant_name='min_rr'
   AND asset_class='crypto_spot' AND strategy='vwap_pullback';

-- 4. target_floor_pct restored at its 2026-06-20 reorg-b2 value
INSERT INTO module_constants
  (module_name, constant_name, value, asset_class, exchange, regime, strategy, updated_at, updated_by)
VALUES
  ('expectancy_gates', 'target_floor_pct', '0.040'::jsonb, 'crypto_spot', '*', '*', '*', NOW(), 'b-reach-baseline-adjust-rollback'),
  ('expectancy_gates', 'target_floor_pct', '0.040'::jsonb, 'xstock_spot', '*', '*', '*', NOW(), 'b-reach-baseline-adjust-rollback')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO UPDATE
  SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by;

DO $$
DECLARE n_tfp int; n_sbt int; n_vp int;
BEGIN
  SELECT count(*) INTO n_tfp FROM module_constants
    WHERE module_name='expectancy_gates' AND constant_name='target_floor_pct';
  SELECT count(*) INTO n_sbt FROM module_constants
    WHERE module_name='expectancy_gates' AND constant_name='reach_atr_max' AND strategy <> '*';
  SELECT count(*) INTO n_vp FROM module_constants
    WHERE module_name='expectancy_gates' AND constant_name='min_rr'
      AND asset_class='crypto_spot' AND strategy='vwap_pullback' AND (value#>>'{}')::numeric = 2.44;
  IF n_tfp <> 2 OR n_sbt <> 0 OR n_vp <> 1 THEN
    RAISE EXCEPTION 'B-REACH-BASELINE-ADJUST rollback incomplete: target_floor_pct=% (need 2), sbt_reach=% (need 0), vwap_pullback@2.44=% (need 1)', n_tfp, n_sbt, n_vp;
  END IF;
END $$;

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- P19-B4a (C8 / scope A6 / RUNNING_ISSUES #153) — correct the xStock pattern
-- single-position cap placeholder.
-- ═════════════════════════════════════════════════════════════════════════════
-- module_constants.pattern_pool_gates.xstock_spot.pattern_max_position_pct was a
-- PLACEHOLDER 0.50 (50% of portfolio in one xStock pattern position) — cloned from
-- the B79.0n.PATTERN-DETECT seed, 3.3x crypto_spot's validated 0.15. It is read on
-- the ACTIVE sizing path (paper-position-sizing.ts) and takes effect the moment
-- active-paper xStock trading turns on (B7b).
--
-- VALIDATION FINDING (C8): a shadow-evidence validation of the cap *binding* is not
-- possible pre-activation — active-paper has been dormant since Phase 8, so no real
-- xStock active position sizes exist to measure against. The cap is non-binding
-- today. But 0.50 has NO evidentiary basis and points the WRONG direction: xStock
-- is LESS liquid than crypto (P19-B4a C3 measured materially thinner books — RTB
-- p99 inter-tick 8.75s vs crypto sub-second, off-RTH far sparser), so its single-
-- position concentration cap should be <= crypto's 0.15, certainly not 3.3x higher.
--
-- INTERIM CORRECTION: align xstock_spot to crypto_spot's validated 0.15 (risk-
-- REDUCING, conservative, DB-adjustable). The FINAL evidence-calibrated per-class
-- value remains a Phase-25 / B7b pre-flight item (#153 stays open for that) — once
-- the calibration window produces real xStock active data to calibrate against.
--
-- GENUINE DELTA. Idempotent (sets to 0.15 regardless of current value).
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

UPDATE module_constants
   SET value = '0.15'::jsonb, updated_at = NOW(), updated_by = 'p19-b4a-c8'
 WHERE module_name = 'pattern_pool_gates'
   AND asset_class = 'xstock_spot'
   AND strategy = '*'
   AND regime = '*'
   AND constant_name = 'pattern_max_position_pct';

COMMIT;

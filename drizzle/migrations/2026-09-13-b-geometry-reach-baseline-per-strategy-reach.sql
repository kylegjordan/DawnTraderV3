-- B-GEOMETRY-REACH-BASELINE (OBJ-A) — per-(strategy × asset_class) reachability ceilings.
--
-- WHAT WAS WRONG: `expectancy_gates.reach_atr_max` had exactly TWO rows (crypto 4.0 / xStock 4.0) and
-- the read site hardcoded `strategy: '*'`, so ONE ceiling served every strategy in a class. The bound
-- is c·√H — a HOLDING-HORIZON statement — and crypto median holds run from 1.8 h to 15.4 h per
-- strategy, so the single ceiling sat 1.5–2.0× looser than four strategies' own horizons. (Seeding
-- per-strategy rows BEFORE this batch would have been a NO-OP: nothing could read them.)
--
-- HOW THESE FOUR VALUES WERE CHOSEN, and the label matters more than the numbers:
-- they are a POLICY TIGHTENING WITH A MEASURED LOWER BOUND, **not a derivation**. `H` is endogenous to
-- the gate being calibrated (the ceiling blocks far targets → those trades exit sooner → H is short),
-- so no value here may be presented as derived. Every row TIGHTENS; none loosens.
--
-- POPULATION, stated because it was the blocker on this batch (`vts_open_trades` is TWO populations):
-- reorg-B4's shadow lane (`context->>'shadow'='true'`, 27,370 crypto rows since 2026-08-01) and the VTS
-- learning lane (2,503). Values below are the SHADOW lane's per-strategy median hold, √-scaled.
-- The shadow lane was selected by a PRE-REGISTERED arbiter (pre-audit §1b-quater, registered at
-- d2c0fd65e and resolved after it): each lane's median was compared against the ACTIVE lane's
-- (`closed_trades`, crypto, filled only) — the population the ceiling actually governs and the only
-- one NOT TTL-censored (`max_hold_switch`: enabled_vts TRUE, enabled_paper/live FALSE, all 2026-07-24).
-- Shadow cleared ≥3 strategies within a 1.25× derived-ceiling tolerance on both population readings;
-- the VTS lane cleared 1 and has only two comparable cells.
--
-- WHY ONLY FOUR ROWS, and each exclusion has its own reason rather than a shared one:
--   • reverse_impulse  — BOTH proxies FAIL the arbiter (0.481 / 0.697) and both are TIGHTER than the
--                        active lane, whose 7.12 h median implies 2.67. Seeding the proxy value would
--                        have been a LIVE THROTTLE. Excluded on evidence, not for want of data.
--   • range_trade      — zero shadow rows AND zero active rows: cannot ship on the basis, and the
--                        arbiter could not grade it at all.
--   • volatility_edge  — active n=11 against the pre-registered n≥30. Per the pre-declared null rule
--                        that is a SILENCE WITH NO REACH: not graded, not failed. Does not ship.
--   • vwap_pullback    — lanes disagree 3.3× and its shadow cell is 48.17 % TTL-censored (a floor, not
--                        an estimate). It is also the only row that could LOOSEN on one lane, and the
--                        standing rule is that no per-strategy row may be looser than the class
--                        default without realised-excursion evidence, which does not exist yet.
-- All four carry forward to B-EXCURSION-RECORD (PHASE_19_PLAN row 2.4g-3).
--
-- CRYPTO ONLY for the calibration rows: `c` is class-dependent because the two classes measure ATR on
-- different bar lengths (crypto 60-min, xStock 15-min), so a crypto √H does not transfer. This mirrors
-- the reorg-B2.3 rule that xStock floors derive from xStock's OWN data, never a crypto borrow.
--
-- reach_atr_max_unknown_floor = the FAIL-CLOSED substitution for an unrecognized strategy token.
-- ⛔ NOTE THE DIRECTION IS THE OPPOSITE OF min_rr's: min_rr is a MINIMUM so its strict value is the
-- class MAX; reach_atr_max is a MAXIMUM so its strict value is the class MIN. Same intent — a drifted
-- token can never be treated more permissively than a known one.
--   crypto_spot 1.97 = the MINIMUM OVER THE ROWS ACTUALLY SEEDED HERE (sma_trend_ride). Bound to the
--                      shipped set deliberately: "the minimum across strategies" would have made the
--                      SAFETY row a function of the calibration decision it exists to outlast.
--   xstock_spot 4.00 = xStock's own class default. No xStock reach row ships, so 4.00 is the strictest
--                      value we have ASSERTED for that class; borrowing crypto's 1.97 would be exactly
--                      the cross-class borrow the bar-length argument forbids. The fail-closed
--                      STRUCTURE ships for xStock now; it becomes load-bearing when xStock rows exist.
--   '*'         1.97 = the global fallback for an unresolved asset_class — the strictest thing we have
--                      asserted anywhere. Same shape as min_rr_unknown_floor's global row.
--                      ⚠️ MEASURED WHILE WRITING THE TEST, AND IT CORRECTS WHAT THIS COMMENT FIRST
--                      CLAIMED: this row cannot actually fire through getPerClassTargetGate today.
--                      `target_floor_pct` also has only two rows (crypto / xStock) and no global '*',
--                      and it is read FIRST, so an unresolved asset class throws there before reach is
--                      ever consulted. The throw is correct (a DB-governed setting fails hard when
--                      absent) — but this row is a FAIL-SAFE FOR A FUTURE in which a global
--                      target_floor_pct exists, NOT a live protection. It ships because the alternative
--                      is a fail-closed row that is silently absent when it is finally needed; it must
--                      NOT be cited as coverage it does not currently provide. Pinned by an assertion
--                      in b-geometry-reach-baseline-per-strategy-reach.test.ts so the real behaviour is
--                      recorded rather than assumed.
-- ⭐ THE SAFETY ROW SHIPS ON THE FULL KEY SET AND IS **NOT** CRYPTO-ONLY. "Crypto only" governs the
-- CALIBRATION rows and must not be read onto the safety row. ⚠️ THE LIVE JUSTIFICATION IS THE xSTOCK
-- HALF, and it is stated alone because the other half does not survive the correction above: a
-- crypto-only floor would leave xStock's unknown-token path on the permissive 4.0, which is exactly
-- the trap the floor exists to close. (The unresolved-ASSET-CLASS argument is NOT part of the live
-- justification — floorPct throws first, per the note on the '*' row.) It is a §8 #10 defect fix and
-- stands independently of the calibration: before this batch `min_rr` failed closed on an unknown
-- token and reach did not.
--
-- Per-(strategy×class) (§11). exchange/regime = wildcard. Idempotent UPSERT so re-apply corrects values.

BEGIN;

INSERT INTO module_constants
  (module_name, constant_name, value, asset_class, exchange, regime, strategy, updated_at, updated_by)
VALUES
  -- crypto_spot per-strategy reachability ceilings — shadow-lane median hold, √-scaled, all TIGHTENING
  -- strategy            value   median hold   vs the 4.0 class default   arbiter ratio vs active
  ('expectancy_gates', 'reach_atr_max', '2.72'::jsonb, 'crypto_spot', '*', '*', 'pivot_shift',         NOW(), 'b-geometry-reach-baseline'), -- 7.41 h  1.47× tighter  1.082
  ('expectancy_gates', 'reach_atr_max', '2.52'::jsonb, 'crypto_spot', '*', '*', 'morning_star',        NOW(), 'b-geometry-reach-baseline'), -- 6.34 h  1.59× tighter  1.049 (both lanes clear)
  ('expectancy_gates', 'reach_atr_max', '2.36'::jsonb, 'crypto_spot', '*', '*', 'inside_bar_reversal', NOW(), 'b-geometry-reach-baseline'), -- 5.55 h  1.70× tighter  0.990
  ('expectancy_gates', 'reach_atr_max', '1.97'::jsonb, 'crypto_spot', '*', '*', 'sma_trend_ride',      NOW(), 'b-geometry-reach-baseline'), -- 3.89 h  2.03× tighter  1.060
  -- unknown-token fail-closed floor — FULL KEY SET, not crypto-only (see the header note)
  ('expectancy_gates', 'reach_atr_max_unknown_floor', '1.97'::jsonb, 'crypto_spot', '*', '*', '*',     NOW(), 'b-geometry-reach-baseline'),
  ('expectancy_gates', 'reach_atr_max_unknown_floor', '4.0'::jsonb,  'xstock_spot', '*', '*', '*',     NOW(), 'b-geometry-reach-baseline'),
  ('expectancy_gates', 'reach_atr_max_unknown_floor', '1.97'::jsonb, '*',           '*', '*', '*',     NOW(), 'b-geometry-reach-baseline')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO UPDATE
  SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by;

-- Verify the seed is complete, and fail the migration LOUDLY if it is not. This lives at the MIGRATION
-- rather than in b72-warmup's boot list, mirroring min_rr_unknown_floor (which is NOT in that list and
-- carries its own RAISE EXCEPTION): the boot assertion cannot distinguish "not seeded yet" from
-- "seeded wrong", and a fail-closed row that is silently absent fails OPEN.
DO $$
DECLARE n_reach int; n_unk int; n_global int; v_floor numeric; v_min_seeded numeric;
BEGIN
  SELECT count(*) INTO n_reach FROM module_constants
    WHERE module_name = 'expectancy_gates' AND constant_name = 'reach_atr_max';
  IF n_reach < 6 THEN
    RAISE EXCEPTION 'B-GEOMETRY-REACH-BASELINE seed incomplete: expected >=6 expectancy_gates.reach_atr_max rows (2 class-default + 4 per-strategy), found %', n_reach;
  END IF;

  SELECT count(*) INTO n_unk FROM module_constants
    WHERE module_name = 'expectancy_gates' AND constant_name = 'reach_atr_max_unknown_floor';
  IF n_unk < 3 THEN
    RAISE EXCEPTION 'B-GEOMETRY-REACH-BASELINE seed incomplete: expected 3 reach_atr_max_unknown_floor rows (crypto/xstock/global), found %', n_unk;
  END IF;

  -- The global '*' row is the one that fires when the asset_class itself is unresolved. Assert it by
  -- NAME, not by count: three rows could all be per-class and the global fallback still missing, which
  -- is the absent-as-valid shape (#546) this whole batch kept tripping over.
  SELECT count(*) INTO n_global FROM module_constants
    WHERE module_name = 'expectancy_gates' AND constant_name = 'reach_atr_max_unknown_floor'
      AND asset_class = '*' AND exchange = '*' AND strategy = '*' AND regime = '*';
  IF n_global <> 1 THEN
    RAISE EXCEPTION 'B-GEOMETRY-REACH-BASELINE seed incomplete: the GLOBAL reach_atr_max_unknown_floor row is missing (found %) — an unresolved asset_class would throw in flight', n_global;
  END IF;

  -- The crypto floor must equal the MINIMUM of the crypto rows actually seeded. If a later migration
  -- adds a tighter per-strategy row and forgets the floor, the floor becomes looser than a real row and
  -- a drifted token gets a MORE permissive gate than a known one — the exact inversion it exists to
  -- prevent. Checked here so that failure is impossible to ship silently.
  SELECT (value #>> '{}')::numeric INTO v_floor FROM module_constants
    WHERE module_name = 'expectancy_gates' AND constant_name = 'reach_atr_max_unknown_floor'
      AND asset_class = 'crypto_spot' AND strategy = '*';
  SELECT min((value #>> '{}')::numeric) INTO v_min_seeded FROM module_constants
    WHERE module_name = 'expectancy_gates' AND constant_name = 'reach_atr_max'
      AND asset_class = 'crypto_spot' AND strategy <> '*';
  IF v_floor IS DISTINCT FROM v_min_seeded THEN
    RAISE EXCEPTION 'B-GEOMETRY-REACH-BASELINE: crypto reach_atr_max_unknown_floor (%) must equal the MINIMUM seeded crypto reach_atr_max (%)', v_floor, v_min_seeded;
  END IF;
END $$;

COMMIT;

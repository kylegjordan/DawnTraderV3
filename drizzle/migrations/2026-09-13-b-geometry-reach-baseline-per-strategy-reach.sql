-- B-GEOMETRY-REACH-BASELINE (OBJ-A) — the reachability ceiling becomes per-(strategy x class),
-- and the unknown-token path fails CLOSED for the first time.
--
-- ⛔⛔ THIS MIGRATION SEEDS **ZERO** PER-STRATEGY CEILINGS. That is the finding, not a shortfall.
-- Four rows (pivot_shift 2.72 / morning_star 2.52 / inside_bar_reversal 2.36 / sma_trend_ride 1.97)
-- were derived, reviewed, and then REFUSED on a measured blast radius (Langston CONDITION-1). What
-- ships is the STRUCTURE: the resolver can now carry a per-strategy ceiling, and an unrecognised
-- token can no longer land on the permissive class default.
--
-- WHAT WAS STRUCTURALLY WRONG, and this part still holds: `expectancy.ts` hardcoded `strategy:'*'`
-- in the key it read `reach_atr_max` with, and that was the only read site tree-wide — so a
-- per-strategy row was unreachable by construction. `min_rr` failed CLOSED on a drifted token and
-- reach did NOT, so an uncanonicalized token took the permissive class 4.0. That is the §8 #10
-- silent-fallback-for-a-DB-governed-setting trap, and it is what this migration closes.
--
-- ⛔⛔ WHY NO CEILING IS SEEDED — TWO SEPARATE REASONS, RECORDED SEPARATELY ON PURPOSE.
-- A later reader citing the first reason against a strategy it does not apply to would be citing
-- something false, so they are not merged (Langston).
--
-- REASON A — REDUNDANT RE-ENCODING (morning_star, inside_bar_reversal, pivot_shift).
--   These strategies compute `targetPrice = entryPrice + target_exit_atr_multiplier * effectiveATR`
--   (morning-star.ts:175, inside-bar-reversal.ts:190, volatility-edge.ts:186, support-bounce.ts:264),
--   so `atrsToTarget` IS that multiplier times the effectiveATR/rawATR ratio. MEASURED on 27,370
--   crypto shadow rows since 2026-08-01, p90 minus p10 of `atrsToTarget`:
--       morning_star 0.001 · support_bounce 0.002 · inside_bar_reversal 0.008 · volatility_edge 0.008
--   Those are SPIKES, not distributions (morning_star: 84.62 % of 3,258 rows on exactly 2.500).
--   ⇒ the ceiling is a KNIFE EDGE: above the spike it refuses ~nothing, below it refuses ~everything.
--   Measured newly-refused share at the derived ceilings: inside_bar_reversal 95.32 %, pivot_shift
--   55.43 %. morning_star's 0.64 % is NOT safety — 2.52 sits 0.02 ATR above a spike holding 84.62 %
--   of its signals, so any drift in the effectiveATR clamp flips it to ~85 %. A hair-trigger.
--   ⇒ FOR THESE, the reachability ceiling and `target_exit_atr_multiplier` are the SAME KNOB, and
--   tuning the ceiling is a strategy kill-switch wearing a feasibility gate's clothes.
--   (Two producers feed these: several strategies also show a 2.500 spike that is NOT their own
--   multiplier — `pattern-recognizer.ts:585-586` hardcodes `atr * 2.5` with the strategy label
--   attached downstream — so a per-strategy ceiling would select between PRODUCERS, not strategies.
--   The third producer, that file's `atr > 0` FALSE arm (`currentPrice * 0.02`, no ATR term), is
--   ABSENT from this population: 0 of 27,370 rows sit at exactly 2 % of entry and 0 rows carry
--   `atrAtOpen = 0`, so it never fires on the crypto shadow lane.)
--
-- REASON B — A LIVE THROTTLE ON A GENUINELY CONTINUOUS DISTRIBUTION (sma_trend_ride). ⚠️ REASON A
--   DOES NOT APPLY TO IT AND MUST NOT BE CITED AGAINST IT (Langston). `sma_trend_ride` has NO ATR
--   TERM ANYWHERE: `strategy-engine.ts:520-533` has two arms — trailing,
--   `entryPrice * (1 + trendStrength * trailing_strength_factor)`, and break,
--   `entryPrice + riskDistance * break_target_r_multiple`. Its `atrsToTarget` is a real continuous
--   ratio: 560 distinct values over 1,362 rows, modal share 3.16 %, p90 minus p10 = 2.991 ATR —
--   375x the spread of morning_star. So the ceiling there IS a genuine distributional selector, and
--   1.97 would have refused a MEASURED 57.49 % of its signals. It is refused as a strategy-behaviour
--   decision, not as redundancy. Its levers are `break_target_r_multiple` and
--   `trailing_strength_factor`, NOT `target_exit_atr_multiplier`.
--   (`vwap_pullback` p90-p10 0.773 and `mean_reversion` 0.151 sit between the two regimes; neither
--   was a candidate, and neither is characterised here beyond the measurement.)
--
-- reach_atr_max_unknown_floor = the FAIL-CLOSED substitution for an unrecognised strategy token.
-- ⛔ THE DIRECTION IS THE OPPOSITE OF min_rr's: min_rr is a MINIMUM so its strict value is the class
-- MAX; reach_atr_max is a MAXIMUM so its strict value is the class MIN. Same intent — a drifted token
-- can never be treated more permissively than a known one.
-- ⭐ WITH ZERO PER-STRATEGY ROWS SEEDED, THE STRICTEST VALUE WE HAVE ASSERTED IN EACH CLASS IS THAT
-- CLASS'S OWN DEFAULT, so every floor row ships at 4.0. The floor therefore changes NO behaviour today
-- and that is correct: it makes the fallback EXPLICIT AND ASSERTED instead of implicit, and it becomes
-- load-bearing the moment a per-strategy row is genuinely justified. The invariant below is what keeps
-- it honest as rows are added later.
-- ⭐ IT SHIPS ON THE FULL KEY SET AND IS **NOT** CRYPTO-ONLY. The live justification is the xStock half:
-- a crypto-only floor would leave xStock's unknown-token path with no fail-closed row at all.
--   ⚠️ The GLOBAL '*' row cannot actually fire through `getPerClassTargetGate` today — `target_floor_pct`
--   also has only two rows and no global '*', and it is read FIRST, so an unresolved asset class throws
--   there before reach is consulted. The throw is correct (a DB-governed setting fails hard when
--   absent). The row is a FAIL-SAFE FOR A FUTURE in which a global `target_floor_pct` exists, NOT live
--   coverage, and it must not be cited as coverage it does not provide. Pinned by an assertion in
--   b-geometry-reach-baseline-per-strategy-reach.test.ts.
--
-- ⛔ DEPLOY ORDER: **MIGRATION FIRST, THEN RESTART.** Code-before-SQL leaves
-- `reach_atr_max_unknown_floor` absent, and an unknown token then throws UNCAUGHT at
-- `signal-orchestrator.ts:1903` — `gateConstantsVersionFor` swallows its throw, the gate does not.
-- Low probability and loud + fail-closed when it fires, but it is an ordering constraint, not a
-- preference. (The reverse order is inert: with the old code the rows are simply unreachable.)
--
-- Per-(strategy x class) (§11). exchange/regime = wildcard. Idempotent UPSERT so re-apply corrects values.

BEGIN;

INSERT INTO module_constants
  (module_name, constant_name, value, asset_class, exchange, regime, strategy, updated_at, updated_by)
VALUES
  -- unknown-token fail-closed floor — FULL KEY SET. No per-strategy ceilings are seeded (see above).
  ('expectancy_gates', 'reach_atr_max_unknown_floor', '4.0'::jsonb, 'crypto_spot', '*', '*', '*', NOW(), 'b-geometry-reach-baseline'),
  ('expectancy_gates', 'reach_atr_max_unknown_floor', '4.0'::jsonb, 'xstock_spot', '*', '*', '*', NOW(), 'b-geometry-reach-baseline'),
  ('expectancy_gates', 'reach_atr_max_unknown_floor', '4.0'::jsonb, '*',           '*', '*', '*', NOW(), 'b-geometry-reach-baseline')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO UPDATE
  SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by;

-- Verify the seed is complete, and fail the migration LOUDLY if it is not. This lives at the MIGRATION
-- rather than in b72-warmup's boot list, mirroring min_rr_unknown_floor (which is NOT in that list and
-- carries its own RAISE EXCEPTION): a boot assertion cannot distinguish "not seeded yet" from "seeded
-- wrong", and a fail-closed row that is silently absent fails OPEN.
DO $$
DECLARE n_unk int; n_global int; v_floor numeric; v_min_seeded numeric; v_class_default numeric;
BEGIN
  SELECT count(*) INTO n_unk FROM module_constants
    WHERE module_name = 'expectancy_gates' AND constant_name = 'reach_atr_max_unknown_floor';
  IF n_unk < 3 THEN
    RAISE EXCEPTION 'B-GEOMETRY-REACH-BASELINE seed incomplete: expected 3 reach_atr_max_unknown_floor rows (crypto/xstock/global), found %', n_unk;
  END IF;

  -- Assert the GLOBAL row BY NAME, not by count: three rows could all be per-class and the global
  -- fallback still missing, which is the absent-as-valid shape (#546) this batch kept tripping over.
  SELECT count(*) INTO n_global FROM module_constants
    WHERE module_name = 'expectancy_gates' AND constant_name = 'reach_atr_max_unknown_floor'
      AND asset_class = '*' AND exchange = '*' AND strategy = '*' AND regime = '*';
  IF n_global <> 1 THEN
    RAISE EXCEPTION 'B-GEOMETRY-REACH-BASELINE: the GLOBAL reach_atr_max_unknown_floor row is missing (found %)', n_global;
  END IF;

  -- ⛔ THE SAFETY INVARIANT, and it is an INEQUALITY rather than an equality (Langston BLOCKER-2).
  -- The property actually argued for is `floor <= every per-strategy ceiling in the class`: a drifted
  -- token must never get a MORE permissive gate than a known one. Equality would additionally fail a
  -- later migration that merely REMOVES or LOOSENS the tightest row, which is perfectly safe.
  -- ⛔ BOTH SELECTS PIN THE FULL KEY (exchange + regime as well as asset_class + strategy). Without
  -- that a second legitimately key-scoped row makes this a multi-row SELECT INTO, which plpgsql
  -- resolves by silently taking one and raising nothing — the n_global check above pins the full key
  -- deliberately, and these must not disagree with it about rigour.
  SELECT (value #>> '{}')::numeric INTO v_floor FROM module_constants
    WHERE module_name = 'expectancy_gates' AND constant_name = 'reach_atr_max_unknown_floor'
      AND asset_class = 'crypto_spot' AND exchange = '*' AND strategy = '*' AND regime = '*';
  SELECT min((value #>> '{}')::numeric) INTO v_min_seeded FROM module_constants
    WHERE module_name = 'expectancy_gates' AND constant_name = 'reach_atr_max'
      AND asset_class = 'crypto_spot' AND exchange = '*' AND regime = '*' AND strategy <> '*';
  SELECT (value #>> '{}')::numeric INTO v_class_default FROM module_constants
    WHERE module_name = 'expectancy_gates' AND constant_name = 'reach_atr_max'
      AND asset_class = 'crypto_spot' AND exchange = '*' AND strategy = '*' AND regime = '*';

  IF v_min_seeded IS NULL THEN
    -- The state THIS migration ships: no per-strategy ceilings exist, so the strictest asserted value
    -- in the class is its own default and the floor must equal it. Asserted rather than assumed, so
    -- that "the floor happens to match" is a checked fact and not a coincidence nobody looked at.
    IF v_floor IS DISTINCT FROM v_class_default THEN
      RAISE EXCEPTION 'B-GEOMETRY-REACH-BASELINE: with no per-strategy crypto ceilings seeded, the floor (%) must equal the class default (%)', v_floor, v_class_default;
    END IF;
  ELSIF v_floor > v_min_seeded THEN
    RAISE EXCEPTION 'B-GEOMETRY-REACH-BASELINE: crypto reach_atr_max_unknown_floor (%) is LOOSER than the tightest seeded crypto ceiling (%) — a drifted token would get a more permissive gate than a known one', v_floor, v_min_seeded;
  END IF;
END $$;

COMMIT;

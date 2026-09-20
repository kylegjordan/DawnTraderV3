-- B-REACH-BASELINE-ADJUST (PHASE_19_PLAN row 3n.v) — the geometry gates get a NEW BASELINE
-- PLACEHOLDER, chosen against realised outcomes rather than against the gates' own counts.
--
-- KYLE, 2026-09-15 (the ruling that unblocked this): "we are protecting a theoretical placeholder and
-- not using all of the data that we've been gathering... this is just our new baseline placeholder
-- from which we can still calibrate later." 2026-09-20, widening it: "strong bull trend and VWAP
-- pullback settings aren't the only settings that should be adjusted."
--
-- ⛔⛔ THIS MIGRATION SHIPS SIX ROWS ACROSS FIVE CELLS AND WITHDRAWS FIVE. The withdrawals are the finding, and each one
-- carries its reason below, because a later reader will otherwise re-propose exactly those five.
--
-- THE EVIDENCE, AND THE CONTROL THAT MAKES IT READABLE. The VTS lane TAGS a signal the RR/reachability
-- gates refuse and simulates it to close, so realised outcomes exist for trades that were never taken.
-- 8,669 closed tagged rows; 4,776 join to exit_decision_archive by trade_id. ⚠️ THE 55.1% IS NOT PURE
-- RETENTION: it is the archive's own 08-01 window PLUS a by-design exclusion — 849 of the in-window
-- misses are maker TWINS the archiver deliberately skips, so the shortfall is structured and
-- entry-mode-correlated, not random. ⚠️ exit_strategy_alternates — the table that looks built for this
-- — matches ZERO of 8,669 and zero of ALL vts_open_trades rows (disjoint id spaces; 2.4g-4 (i)).
-- ⛔⛔ AND DO NOT REPEAT THE EPOCH CLAIM THIS HEADER FIRST CARRIED. "All rows carry one
-- calibration_state" is TRUE and MEANS NOTHING: that column is a NOT NULL DEFAULT no writer sets, so
-- one value is what a constant looks like. The real stamp (module_constants.calibration_epoch) moved
-- INSIDE the window — 2026-09-11, 09-15 and 09-19 — so every pooled figure here spans a boundary and
-- the one cell where it changes the sign is split explicitly below.
--
-- ⛔ THE CONTROL: what the gates ADMIT, measured in the SAME lane and the same table as the cohorts —
-- pooled, crypto -1.606% / 26.6% win (n=398) and xStock -0.700% / 31.1% (n=630). So "the refused
-- cohort lost money" is NOT a justification for a gate: the admitted cohort loses money too. Every row
-- below is judged against a control, never against zero.
-- ⛔⛔ AND THE POOLED CONTROL IS A MIXTURE — USE THE PER-CELL ONE WHEREVER IT EXISTS (Langston, Step 4).
-- The pooled xStock control is 63% one strategy (morning_star, 398 of 630), and judging cells against
-- it REVERSED one withdrawal that its own admitted cohort does not support. Per-cell is the default
-- here; the pooled control is used only where a cell's admitted set is EMPTY, which is stated where it
-- happens.
-- ⚠️ Crypto VTS books the observed MARK at exit (favourable by ~half a spread). It biases the cohort
-- and the control IDENTICALLY, so the RELATIVE comparison is robust and the absolute levels are
-- optimistic. No absolute level is load-bearing here.
-- ⚠️ DURATION IS NOT CONTROLLED and the cohorts differ ~3.5x (crypto medians: admitted 295 min,
-- rr_below_min 1,739, unreachable 1,045). Under a concurrency cap a percentage earned over triple the
-- capital-time is a different economic object, and nothing here rests on a percentage alone where that
-- gap is large.
--
-- ══ WHAT SHIPS ══
-- (1) reach_atr_max = 6.5 for strong_bull_trend, BOTH classes.
--     Its geometry is stop = entry - atr*3.0 and target = entry + atr*6.0, and the guard divides by the
--     CLAMPED ATR, so atrsToTarget is >= 6.0 ALWAYS. Against a 4.0 ceiling it is not occasionally
--     unreachable, it is CATEGORICALLY OFF: 0 passes of 367,009 on crypto and 0 of 406 on xStock.
--     WHY 6.5 AND NOT 6.0: 6.0 is the value its geometry produces identically, so a ceiling there is an
--     undefined comparison decided by float noise (the guard refuses on '>' against 6.0 +/- 1e-13).
--     WHY NOT HIGHER: the moments bound the tail. Sum((x−6)^2) = 1088.193627 over atrPairedN = 251,334
--     crypto ⇒ by Markov at most 4,352.8 evaluations reach 6.5 and at most 1,088.2 reach 7.0.
--     ⛔ NAME THE DENOMINATOR — the two in play differ by 10%: against atrPairedN (251,334) that is
--     1.73% and 0.43%; against attGt4 (225,978 — the tail counters' OWN population, which opens about
--     four days later) it is 1.93% and 0.48%. The attGt4 figure answers "of what the 4.0 ceiling
--     refuses today", and it is the one the batch documents quote.
--     ⚠️ AND SAY WHAT THE RESIDUAL IS, or a later reader tunes 6.5 believing they are tuning reach:
--     for THIS cell atrsToTarget IS target_exit_atr_multiplier × (effectiveATR/rawATR), so a value
--     above 6.5 does NOT mean the target is further away — the target is always 6.0 ATRs out. It means
--     the ATR CLAMP is biting, i.e. effectiveATR/rawATR > 1.083. The ceiling and the multiplier are the
--     SAME KNOB here (Langston's own 2.4g ruling), and the clamp is a hardcoded TS constant, not a DB
--     lever. On xStock both moments are 0.000000 over 131 paired — the clamp never bites there.
--     EVIDENCE, CRYPTO: the refused cohort realises −0.990% at 41.5% win (n=1,768) against a POOLED
--     admitted control of −1.606% / 26.6%.
--     ⭐ WHY A POOLED CONTROL AND NOT A PER-CELL ONE — the batch's strongest argument, and Langston is
--     the one who made it: for this cell n_admitted = ZERO. The gate refuses 100% of it, so "what this
--     cell admits" is an EMPTY SET and the pooled control is the only one that exists.
--     ⚠️ AND THE −0.990% IS ONE NUMBER OVER TWO POPULATIONS: split at the 2026-09-11 epoch bump it is
--     −1.501% (n=1,320) before and +0.516% (n=448) after — post-bump it is POSITIVE. Crypto fees were
--     NOT touched on 09-11, so this is not the fee change; it is stated as a mixture, not resolved.
--     ⛔⛔ EVIDENCE, xSTOCK: WITHDRAWN AS AN ARTIFACT. The +8.86%/+8.09% at 100% win this header first
--     carried was 89 of 89 rows exiting TP_target_hit with a MEDIAN HOLD OF 1.0 MINUTE against a target
--     six ATRs away — on symbols STX/USD and STRK/USD, which are CRYPTO pairs on rows labelled
--     xstock_spot. Control: the same query on crypto returns SL_hit 1,002 / TP_target_hit 715 /
--     time_stop 51 at 855–1,022 minute medians. ⇒ THE xSTOCK CEILING SHIPS WITH NO OUTCOME EVIDENCE
--     EITHER WAY, on the finding that it is CATEGORICALLY off (0 passes of 406), that nobody decided
--     that, and Kyle's placed ruling. The mislabelling is filed as B-VTS-CLASS-LABEL-INTEGRITY.
--     ⭐ LANGSTON RULED IT SHIPS (Step 4, 2026-09-20), and the argument is ARITHMETIC, not the cohort:
--     both multipliers are single asset_class='*' rows, so the geometry is CLASS-INVARIANT and xStock
--     is categorically off BY CONSTRUCTION exactly as crypto is. Evidence AGAINST overrides a
--     placeholder; ABSENCE of evidence does not — and holding this one cell for evidence would be
--     re-imposing by hand the very rule Kyle struck on 09-15.
--     ⛔ AND THE CORPUS A HOLD WOULD WAIT FOR DOES NOT EXIST: all 256 xstock_spot/strong_bull_trend
--     rows ever written are 3 symbols (STX/USD 138, STRK/USD 114, ADI/USD 4), every one priced at or
--     below $7.43. B-VTS-CLASS-LABEL-INTEGRITY relabels this cell to n=0, not to a readable number.
--     ⚠️ BINDING FORWARD: the label contamination is decision-INERT here ONLY because this migration
--     ships 6.5 to BOTH classes, so a crypto row wearing an xStock label is treated identically either
--     way. That does NOT extend to any later per-class reading of this table.
--     ⛔ STATED AGAINST INTEREST: Kyle's replay evidence (1,288 crypto maker trades on raw 1-minute
--     bars: 2R −0.059, 4R +0.052, 6R +0.108 per trade) is doing real work here, and the batch
--     pre-registered a rollback trigger BEFORE the deploy; see the pre-audit A-7.
-- (2) min_rr = 1.95 for xstock_spot/strong_bull_trend (NEW ROW).
--     ⛔ C-3 (Langston): THIS ROW AND THE xSTOCK CEILING SHIP TOGETHER OR NOT AT ALL. Under a 4.0
--     ceiling this floor is UNEXERCISABLE by construction — the reach gate refuses the signal before
--     the float-noise question can arise — so shipping the floor alone would be a no-op wearing a
--     fix's clothes. Both are in this migration; a partial revert must take both.
--     It had no row, so it inherited the class default 2.00 — against a structural RR that IS 2.0, and
--     measured across 406 evaluations as rrMin 1.9999999999999791 .. rrMax 2.0000000000000155. The gate
--     was being decided at the fourteenth decimal place, firing on ~11.9-15.1% of evaluations (bounded
--     by the pre-seed identification on its two sibling cells).
--     ⛔ THIS ROW SHIPS ON THE CORRECTNESS ARGUMENT ALONE. An earlier draft cited a +8.84% / 100%-win
--     refused cohort; that cohort is the SAME 89 mislabelled rows withdrawn under (1), so it is struck
--     here too. The argument that survives never needed it: a floor EQUAL to the value a strategy's
--     geometry produces identically is an undefined comparison, whatever the outcomes turn out to be.
--     1.95 clears the spike by 0.05 — for a constant-RR cell every floor in (0, spike) is equivalent,
--     so the margin is chosen to be unambiguous rather than tight.
-- (3) min_rr = 1.95 for crypto_spot/vwap_bounce (NEW ROW) — A CORRECTNESS SEED, NOT A CALIBRATION.
--     Same shape: no row, class default 2.00, and target = entry + risk*target_r_multiple with
--     target_r_multiple = 2, so RR is identically 2.0. It refuses 65 of 8,633 on float noise alone.
--     It is a LIVE instance of the clause this batch adds to ADJUSTMENT_FRAMEWORK, so shipping the rule
--     while leaving the instance would be the fix-follows-pointer failure.
-- (4) min_rr 2.44 -> 1.95 for crypto_spot/vwap_pullback.
--     Its refused cohort is TWO POINTS and they disagree: RR 2.00 realises +4.85% at 63.6% win (n=66)
--     while RR 0.80 realises -3.63% at 10.0% win (n=10).
--     ⛔ BUT NOT AS "ADMIT THE GOOD HALF, KEEP REFUSING THE BAD HALF", WHICH IS WHAT AN EARLIER DRAFT
--     SAID AND IS WRONG: THE TWO POINTS ARE PERFECTLY SEPARATED IN TIME. RR 0.80 ran 2026-06-25 to
--     08-05 (n=63) and RR 2.00 from 08-07 to 09-18 (n=82), with no overlap — today's code cannot emit
--     0.80 on this branch at all. So there is no bad half left to refuse. THE HONEST STATEMENT IS
--     STRONGER: the 2.44 floor currently refuses 100% of what this strategy now produces, and that
--     population realises +3.771% (n=61) before the 09-11 epoch bump and +3.601% at 73.3% win (n=15)
--     after it — positive on both sides. 1.95 admits it with margin, and still refuses 0.80 if the old
--     geometry ever returns.
--     ⚠️ ITS 2.44 CAME FROM A SELF-REFERENTIAL DERIVATION: the June migration set each floor "a notch
--     below that strategy's own measured mean RR", which cannot be evidence about the population it
--     gates — and 2.44 now stands ABOVE that strategy's own mean of 2.12.
--
-- ══ WHAT IS DELETED ══
-- (5) target_floor_pct — BOTH rows. The floor-LIFT it fed was removed at reorg-B2.1 (113e658c6,
--     2026-06-21) and it has changed no price since; every consumer passed it to a function that had
--     stopped reading it.
--     ⛔ IT WAS NOT INERT AS A THROW, so the code change ships in the SAME commit: it was read FIRST and
--     unconditionally, BEFORE the strategy token is canonicalized, which made it — not min_rr — the
--     thing that refused an UNRESOLVED ASSET CLASS. The unknown-floor rows DO have a global '*'
--     fallback, so deleting it alone would have turned a hard failure into a silent permissive resolve.
--     THE ASSERTION MOVED to the per-class min_rr DEFAULT row, which has the same shape (two rows, no
--     global '*'). Invariant (4) below pins that dependency at migration time.
--
-- ══ WHAT WAS PROPOSED AND WITHDRAWN — six cells, each with its reason ══
--   ⛔ xstock_spot/vwap_pullback  WITHDRAWAL REVERSED BY LANGSTON AT STEP 4 — IT SHIPS, see (6) below.
--                               The pooled xStock control is 63% ONE STRATEGY (morning_star, 398 of
--                               630), and against its OWN admitted cohort this cell is BETTER ON BOTH
--                               AXES. A pooled control is a mixture; a per-cell one exists; use it.
--   xstock_spot/sma_trend_ride  ceiling — EVIDENCE AGAINST: -1.38/-1.31/-2.13/-1.78% at 25-38% win
--                               (n=547), and it gets WORSE as the target gets further.
--   crypto_spot/sma_trend_ride  ceiling — NOT THIS BATCH'S: RUNNING_ISSUES #696 holds it, Langston
--                               ruled HOLD the row, and the recorded options there are revert-the-row
--                               or a volatility-CONDITIONED allowance. A flat ceiling is neither.
--   crypto_spot/reverse_impulse floor   — EVIDENCE AGAINST: refused cohort -4.06%, 0% win (n=14).
--   xstock_spot/morning_star    floor   — NO EVIDENCE: no cohort rows (n < 10).
--   xstock_spot/vwap_bounce     ceiling — NO EVIDENCE: 3 refused-and-joined rows.
--   ⛔ xstock_spot/range_trade    ceiling — THE WITHDRAWAL SURVIVES BUT ITS STATED REASON WAS FALSE, and
--                               a migration header is the durable precedent, so the correction lands
--                               here: it has 20 refused-and-joined rows, not "fewer than 10". It is
--                               withdrawn ON MERITS — refused −0.554% at 15.0% win against its own
--                               admitted +0.219% at 50.0%.
--
-- ⛔ OUT OF SCOPE, DELIBERATELY: the *_unknown_floor rows. They are the fail-CLOSED substitution for a
-- drifted token, not a baseline for a known one. Leaving them is a CHOICE and its direction is
-- verified, not assumed: after this migration the unknown-token reach floor (4.0) is STRICTER than the
-- seeded known-token ceiling (6.5), and the unknown-token min_rr floors (2.88 / 2.16) stay STRICTER
-- than every seeded known-token floor. A drifted token can never be treated more permissively.
--
-- Per-(strategy x class), exchange/regime wildcard. Idempotent UPSERT so a re-apply corrects values.
-- Rollback: 2026-09-21-b-reach-baseline-adjust-geometry-baseline-rollback.sql (restores all six).

BEGIN;

INSERT INTO module_constants
  (module_name, constant_name, value, asset_class, exchange, regime, strategy, updated_at, updated_by)
VALUES
  ('expectancy_gates', 'reach_atr_max', '6.5'::jsonb,  'crypto_spot', '*', '*', 'strong_bull_trend', NOW(), 'b-reach-baseline-adjust'),
  ('expectancy_gates', 'reach_atr_max', '6.5'::jsonb,  'xstock_spot', '*', '*', 'strong_bull_trend', NOW(), 'b-reach-baseline-adjust'),
  ('expectancy_gates', 'min_rr',        '1.95'::jsonb, 'xstock_spot', '*', '*', 'strong_bull_trend', NOW(), 'b-reach-baseline-adjust'),
  ('expectancy_gates', 'min_rr',        '1.95'::jsonb, 'crypto_spot', '*', '*', 'vwap_bounce',       NOW(), 'b-reach-baseline-adjust'),
  ('expectancy_gates', 'min_rr',        '1.95'::jsonb, 'crypto_spot', '*', '*', 'vwap_pullback',     NOW(), 'b-reach-baseline-adjust'),
  -- (6) xstock_spot/vwap_pullback reach 6.0 — the withdrawal Langston REVERSED at Step 4. Against its
  -- OWN admitted cohort (−1.605% / 20.0% win, n=35) the refused cohort is better on BOTH axes
  -- (−1.351% / 29.7%, n=860), and every measured band is at or above that admitted cohort's win rate.
  -- WHY 6.0 AND NOT HIGHER: it admits 35.1% of what the 4.0 ceiling refuses today. The largest band
  -- (7+, n=603, −1.266% / 31.3%) sits around atrsToTarget 12 and STAYS REFUSED — a ceiling that
  -- admitted it would be a horizon claim nothing in this batch measured.
  ('expectancy_gates', 'reach_atr_max', '6.0'::jsonb,  'xstock_spot', '*', '*', 'vwap_pullback',     NOW(), 'b-reach-baseline-adjust')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO UPDATE
  SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by;

DELETE FROM module_constants
 WHERE module_name = 'expectancy_gates' AND constant_name = 'target_floor_pct';

-- ── INVARIANTS — fail the migration loudly rather than ship a half-applied geometry baseline ──
DO $$
DECLARE
  n_reach int; n_floor int; n_tfp int; n_classdefault int; n_global int; n_mult int; bad text;
BEGIN
  -- (1) both reach ceilings landed, and NEITHER is below its class default (Langston's binding-forward
  --     condition on the 2.4g-3 ratchet: a loosening batch may not ship a TIGHTENING under cover).
  SELECT count(*) INTO n_reach FROM module_constants
    WHERE module_name='expectancy_gates' AND constant_name='reach_atr_max'
      AND strategy='strong_bull_trend' AND (value#>>'{}')::numeric = 6.5;
  IF n_reach <> 2 THEN
    RAISE EXCEPTION 'B-REACH-BASELINE-ADJUST: expected 2 strong_bull_trend reach_atr_max rows at 6.5, found %', n_reach;
  END IF;
  SELECT string_agg(s.asset_class, ',') INTO bad FROM module_constants s
    JOIN module_constants d
      ON d.module_name='expectancy_gates' AND d.constant_name='reach_atr_max'
     AND d.strategy='*' AND d.asset_class=s.asset_class
   WHERE s.module_name='expectancy_gates' AND s.constant_name='reach_atr_max' AND s.strategy<>'*'
     AND (s.value#>>'{}')::numeric < (d.value#>>'{}')::numeric;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'B-REACH-BASELINE-ADJUST: per-strategy reach ceiling BELOW its class default for: %', bad;
  END IF;

  -- (2) every seeded per-strategy min_rr stays at or below its class unknown-floor, so a drifted token
  --     is never treated more permissively than a known one.
  SELECT string_agg(s.asset_class||'/'||s.strategy, ',') INTO bad FROM module_constants s
    JOIN module_constants u
      ON u.module_name='expectancy_gates' AND u.constant_name='min_rr_unknown_floor'
     AND u.asset_class=s.asset_class AND u.strategy='*'
   WHERE s.module_name='expectancy_gates' AND s.constant_name='min_rr' AND s.strategy<>'*'
     AND (s.value#>>'{}')::numeric > (u.value#>>'{}')::numeric;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'B-REACH-BASELINE-ADJUST: per-strategy min_rr ABOVE its class unknown-floor for: %', bad;
  END IF;

  -- (3) the three floors this batch seeds clear the 2.0 spike they exist to get away from.
  SELECT count(*) INTO n_floor FROM module_constants
    WHERE module_name='expectancy_gates' AND constant_name='min_rr'
      AND updated_by='b-reach-baseline-adjust' AND (value#>>'{}')::numeric < 2.0;
  IF n_floor <> 3 THEN
    RAISE EXCEPTION 'B-REACH-BASELINE-ADJUST: expected 3 seeded min_rr rows strictly below 2.0, found %', n_floor;
  END IF;

  -- (4) target_floor_pct is gone AND the row that inherits its fail-hard duty is present for every
  --     class that had one. Ordering matters: the code asserts min_rr at the CLASS key first.
  SELECT count(*) INTO n_tfp FROM module_constants
    WHERE module_name='expectancy_gates' AND constant_name='target_floor_pct';
  IF n_tfp <> 0 THEN
    RAISE EXCEPTION 'B-REACH-BASELINE-ADJUST: target_floor_pct still present (% rows)', n_tfp;
  END IF;
  SELECT count(*) INTO n_classdefault FROM module_constants
    WHERE module_name='expectancy_gates' AND constant_name='min_rr' AND strategy='*'
      AND asset_class IN ('crypto_spot','xstock_spot');
  IF n_classdefault <> 2 THEN
    RAISE EXCEPTION 'B-REACH-BASELINE-ADJUST: the per-class min_rr default rows that now carry the fail-hard assertion are missing (found %, need 2) — DO NOT DEPLOY', n_classdefault;
  END IF;

  -- (4b) ⛔⛔ WHAT (4) ACTUALLY GUARDS IS "the rows exist", AND THAT IS NOT WHAT THE FAIL-HARD RESTS ON
  -- (Langston, Step 4). It rests on the ABSENCE of a wildcard-asset_class min_rr row: the resolver
  -- scores a wildcard asset_class row 0 and MATCHES ANY KEY, so one global row would silently satisfy
  -- an unresolved class and the throw would vanish.
  -- ⚠️ THE PRECEDENT FOR ADDING ONE IS IN THIS SAME CONSTANT FAMILY, TWICE: min_rr_unknown_floor and
  -- reach_atr_max_unknown_floor each already carry a global row beside their per-class rows. This is a
  -- live shape, not a hypothetical, and the durable code-side fix is homed at B-GATE-WILDCARD-REFUSE.
  SELECT count(*) INTO n_global FROM module_constants
    WHERE module_name='expectancy_gates' AND constant_name='min_rr' AND asset_class='*';
  IF n_global <> 0 THEN
    RAISE EXCEPTION 'B-REACH-BASELINE-ADJUST: a wildcard asset_class min_rr row exists (% found) — it matches any key and would silently defeat the unresolved-asset-class fail-hard this batch moved onto min_rr. DO NOT DEPLOY', n_global;
  END IF;

  -- (5) ⛔⛔ PIN THE TWO MULTIPLIERS EVERY VALUE HERE IS A FUNCTION OF (Langston C-1, Step 4).
  -- 6.5 is chosen because strong_bull_trend's target is atr*6.0 and its stop atr*3.0, and 1.95 because
  -- that ratio makes its RR identically 2.0. NOTHING ELSE PINS THOSE TWO ROWS — and `2.4g-5` is still
  -- OPEN on exactly the lever that moves them. If either moves, these ceilings and floors stop meaning
  -- what this header says they mean, and a re-apply of this migration is the cheapest place to find out.
  SELECT count(*) INTO n_mult FROM module_constants
   WHERE (module_name='strategy.strong_bull_trend' AND constant_name='stop_loss_atr_multiplier'   AND (value#>>'{}')::numeric = 3.0)
      OR (module_name='strategy.strong_bull_trend' AND constant_name='target_exit_atr_multiplier' AND (value#>>'{}')::numeric = 6.0);
  IF n_mult <> 2 THEN
    RAISE EXCEPTION 'B-REACH-BASELINE-ADJUST: strong_bull_trend geometry has MOVED (expected stop 3.0 + target 6.0, matched % rows). The 6.5 ceiling and the 1.95 floor are derived from those two values and no longer mean what the migration header says — re-derive before applying', n_mult;
  END IF;
END $$;

COMMIT;

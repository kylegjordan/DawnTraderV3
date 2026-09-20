-- B-REACH-BASELINE-ADJUST (PHASE_19_PLAN row 3n.v) — the geometry gates get a NEW BASELINE
-- PLACEHOLDER, chosen against realised outcomes rather than against the gates' own counts.
--
-- KYLE, 2026-09-15 (the ruling that unblocked this): "we are protecting a theoretical placeholder and
-- not using all of the data that we've been gathering... this is just our new baseline placeholder
-- from which we can still calibrate later." 2026-09-20, widening it: "strong bull trend and VWAP
-- pullback settings aren't the only settings that should be adjusted."
--
-- ⛔⛔ THIS MIGRATION SHIPS FOUR ROWS AND WITHDRAWS SIX. The withdrawals are the finding, and each one
-- carries its reason below, because a later reader will otherwise re-propose exactly the six.
--
-- THE EVIDENCE, AND THE CONTROL THAT MAKES IT READABLE. The VTS lane TAGS a signal the RR/reachability
-- gates refuse and simulates it to close, so realised outcomes exist for trades that were never taken.
-- 8,669 closed tagged rows; 4,776 join to exit_decision_archive by trade_id (the 55.1% is that
-- archive's own 08-01 retention window, not the join). All 8,669 carry ONE calibration_state, so no
-- epoch split is needed. ⚠️ exit_strategy_alternates — the table that looks built for this — matches
-- ZERO of 8,669 and zero of ALL vts_open_trades rows (disjoint id spaces; RUNNING_ISSUES 2.4g-4 (i)).
--
-- ⛔ THE CONTROL: what the gates ADMIT today realises crypto -1.606% / 26.6% win (n=398) and xStock
-- -0.700% / 31.1% (n=630). So "the refused cohort lost money" is NOT a justification for a gate — the
-- admitted cohort loses money too. Every row below is judged against that control, never against zero.
-- ⚠️ Crypto VTS books the observed MARK at exit (favourable by ~half a spread). It biases the cohort
-- and the control IDENTICALLY, so the RELATIVE comparison is robust and the absolute levels are
-- optimistic. No absolute level is load-bearing here.
--
-- ══ WHAT SHIPS ══
-- (1) reach_atr_max = 6.5 for strong_bull_trend, BOTH classes.
--     Its geometry is stop = entry - atr*3.0 and target = entry + atr*6.0, and the guard divides by the
--     CLAMPED ATR, so atrsToTarget is >= 6.0 ALWAYS. Against a 4.0 ceiling it is not occasionally
--     unreachable, it is CATEGORICALLY OFF: 0 passes of 367,009 on crypto and 0 of 406 on xStock.
--     WHY 6.5 AND NOT 6.0: 6.0 is the value its geometry produces identically, so a ceiling there is an
--     undefined comparison decided by float noise (the guard refuses on '>' against 6.0 +/- 1e-13).
--     WHY NOT HIGHER: the moments bound the tail. Sum((x-6)^2) = 1088.193627 over n = 251,334 crypto,
--     so by Markov at most 4,353 evaluations (1.93% of the tail population) reach 6.5 and at most
--     1,088 (0.48%) reach 7.0. On xStock Sum(x-6) and Sum((x-6)^2) are both 0.000000 over 131 paired.
--     EVIDENCE: xStock's refused cohort realises +8.86% (n=36) and +8.09% (n=31), 100% win in BOTH
--     ATRs-to-target bands, against a -0.700% control. Crypto's realises -1.10% (n=885) and -0.89%
--     (n=883) at ~41% win against a -1.606% / 26.6% control.
--     ⛔ STATED AGAINST INTEREST: the crypto leg admits a cohort that BEATS the control on both axes and
--     is STILL NEGATIVE. What carries it is Kyle's ruling plus his replay evidence (1,288 crypto maker
--     trades on raw 1-minute bars: 2R -0.059, 4R +0.052, 6R +0.108 per trade) — not this cohort. That
--     is why the batch pre-registered a rollback trigger BEFORE the deploy; see the pre-audit A-7.
-- (2) min_rr = 1.95 for xstock_spot/strong_bull_trend (NEW ROW).
--     It had no row, so it inherited the class default 2.00 — against a structural RR that IS 2.0, and
--     measured across 406 evaluations as rrMin 1.9999999999999791 .. rrMax 2.0000000000000155. The gate
--     was being decided at the fourteenth decimal place, firing on ~11.9-15.1% of evaluations (bounded
--     by the pre-seed identification on its two sibling cells). Its refused cohort realises +8.84%,
--     100% win (n=22). 1.95 clears the spike by 0.05 — for a constant-RR cell every floor in (0, spike)
--     is equivalent, so the margin is chosen to be unambiguous, not to be tight.
-- (3) min_rr = 1.95 for crypto_spot/vwap_bounce (NEW ROW) — A CORRECTNESS SEED, NOT A CALIBRATION.
--     Same shape: no row, class default 2.00, and target = entry + risk*target_r_multiple with
--     target_r_multiple = 2, so RR is identically 2.0. It refuses 65 of 8,633 on float noise alone.
--     It is a LIVE instance of the clause this batch adds to ADJUSTMENT_FRAMEWORK, so shipping the rule
--     while leaving the instance would be the fix-follows-pointer failure.
-- (4) min_rr 2.44 -> 1.95 for crypto_spot/vwap_pullback.
--     Its refused cohort is TWO POINTS and they disagree: RR 2.00 realises +4.85% at 63.6% win (n=66)
--     while RR 0.80 realises -3.63% at 10.0% win (n=10). Any floor in (0.80, 2.00] admits the first and
--     still refuses the second. 1.95 does that with margin at both ends.
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
--   xstock_spot/vwap_pullback   ceiling — EVIDENCE AGAINST: -1.42/-1.59/-1.64/-1.27% at 23-31% win
--                               across four bands (n=860) against a -0.700% / 31.1% control.
--   xstock_spot/sma_trend_ride  ceiling — EVIDENCE AGAINST: -1.38/-1.31/-2.13/-1.78% at 25-38% win
--                               (n=547), and it gets WORSE as the target gets further.
--   crypto_spot/sma_trend_ride  ceiling — NOT THIS BATCH'S: RUNNING_ISSUES #696 holds it, Langston
--                               ruled HOLD the row, and the recorded options there are revert-the-row
--                               or a volatility-CONDITIONED allowance. A flat ceiling is neither.
--   crypto_spot/reverse_impulse floor   — EVIDENCE AGAINST: refused cohort -4.06%, 0% win (n=14).
--   xstock_spot/morning_star    floor   — NO EVIDENCE: no cohort rows (n < 10).
--   xstock_spot/vwap_bounce,
--   xstock_spot/range_trade     ceiling — NO EVIDENCE: no cohort rows (n < 10).
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
  ('expectancy_gates', 'min_rr',        '1.95'::jsonb, 'crypto_spot', '*', '*', 'vwap_pullback',     NOW(), 'b-reach-baseline-adjust')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO UPDATE
  SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by;

DELETE FROM module_constants
 WHERE module_name = 'expectancy_gates' AND constant_name = 'target_floor_pct';

-- ── INVARIANTS — fail the migration loudly rather than ship a half-applied geometry baseline ──
DO $$
DECLARE
  n_reach int; n_floor int; n_tfp int; n_classdefault int; bad text;
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
END $$;

COMMIT;

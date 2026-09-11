-- B-XSTOCK-FEE-CONTRACT (#1010, PHASE_19_PLAN row 2.4-FEE) — xStock is priced on the xStock schedule, not the crypto one.
-- Audit + plan: Claude Comms and Packages/Scope Files/B_XSTOCK_FEE_CONTRACT_PRE_AUDIT.md (P1, P4, P6).
--
-- ONE TRANSACTION. Any post-condition failure below rolls ALL of it back, fails db:migrate, and stops
-- dt-deploy before `pm2 restart` — old code keeps running against unchanged rows (pre-audit A11).
--
--   P1  fee_model xstock_spot: spot_taker_fee 0.008 -> 0.0010, spot_maker_fee 0.004 -> -0.0002 (a REBATE).
--       Kraken Pro xStocks schedule, account-confirmed 2026-09-06
--       (1-system-manual/external-references/KRAKEN_FEE_SCHEDULE_REFERENCE.md §2).
--       UNCONDITIONAL SET (Langston ruling 2): no `WHERE value = ...`, so a row that had drifted still lands correct.
--       crypto_spot is NOT touched — 0.008 / 0.004 is exactly spot rung 1, account-confirmed.
--   P4  module 'cost_model' deleted wholesale (5 rows, zero code readers — #133/#134). The same commit removes it from
--       b72-warmup PREFETCH_MODULES, which otherwise refuses boot on a zero-row module.
--       calibration_ledger xStock fee rows corrected (display-only table; decision_grade stays true — Langston ruling 2).
--   P6  calibration epochs, xStock ONLY (a fee is shared substrate for vts, paper_sim and live — ADJUSTMENT_FRAMEWORK
--       rule 1): vts/xstock_spot +1, paper_sim/xstock_spot +1, INSERT live/xstock_spot = live/* + 1.
--       Crypto and wildcard epoch rows must not move. Asserted as a DELTA, because the absolute values differ between
--       staging and a fresh CI database.
--
-- ⛔ ROLLBACK: dt-deploy has NO rollback verb and migrates forward only. Run
--    2026-09-11-b-xstock-fee-contract-rollback.sql BY HAND *before* deploying any pre-batch sha.

BEGIN;

CREATE TEMP TABLE _bxfc_epoch_before ON COMMIT DROP AS
SELECT constant_name, asset_class, (value)::text::numeric AS v
FROM module_constants
WHERE module_name = 'calibration_epoch' AND exchange = '*' AND strategy = '*' AND regime = '*';

-- ── P1 ─────────────────────────────────────────────────────────────────────────────────────────
UPDATE module_constants
SET value = '0.0010'::jsonb, updated_by = 'b-xstock-fee-contract', updated_at = NOW()
WHERE module_name = 'fee_model' AND exchange = '*' AND asset_class = 'xstock_spot'
  AND strategy = '*' AND regime = '*' AND constant_name = 'spot_taker_fee';

UPDATE module_constants
SET value = '-0.0002'::jsonb, updated_by = 'b-xstock-fee-contract', updated_at = NOW()
WHERE module_name = 'fee_model' AND exchange = '*' AND asset_class = 'xstock_spot'
  AND strategy = '*' AND regime = '*' AND constant_name = 'spot_maker_fee';

-- ── P4 ─────────────────────────────────────────────────────────────────────────────────────────
DELETE FROM module_constants WHERE module_name = 'cost_model';

UPDATE calibration_ledger
SET current_value = '0.10%',
    notes = 'Kraken Pro xStocks taker, account-confirmed 2026-09-06 (was 0.26%, a crypto-schedule figure). B-XSTOCK-FEE-CONTRACT #1010.',
    updated_at = NOW()
WHERE sub_batch = 'B.0' AND asset_class = 'xstock_spot' AND setting_key = 'feeRateTaker' AND scope = 'friction';

UPDATE calibration_ledger
SET current_value = '-0.02%',
    notes = 'Kraken Pro xStocks maker REBATE, account-confirmed 2026-09-06 (was 0.16%). B-XSTOCK-FEE-CONTRACT #1010.',
    updated_at = NOW()
WHERE sub_batch = 'B.0' AND asset_class = 'xstock_spot' AND setting_key = 'feeRateMaker' AND scope = 'friction';

-- ── P6 ─────────────────────────────────────────────────────────────────────────────────────────
UPDATE module_constants mc
SET value = to_jsonb((mc.value)::text::numeric + 1), updated_by = 'b-xstock-fee-contract', updated_at = NOW()
WHERE mc.module_name = 'calibration_epoch' AND mc.exchange = '*' AND mc.strategy = '*' AND mc.regime = '*'
  AND mc.asset_class = 'xstock_spot' AND mc.constant_name IN ('vts', 'paper_sim')
  AND mc.updated_by <> 'b-xstock-fee-contract';

INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
SELECT 'calibration_epoch', '*', 'xstock_spot', '*', '*', 'live', to_jsonb((mc.value)::text::numeric + 1), 'b-xstock-fee-contract'
FROM module_constants mc
WHERE mc.module_name = 'calibration_epoch' AND mc.exchange = '*' AND mc.asset_class = '*'
  AND mc.strategy = '*' AND mc.regime = '*' AND mc.constant_name = 'live'
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- ── POST-CONDITIONS ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  n int;
  v numeric;
  base numeric;
  r record;
BEGIN
  -- P1: four fee rows, exact values.
  SELECT count(*) INTO n FROM module_constants
  WHERE module_name = 'fee_model' AND exchange = '*' AND strategy = '*' AND regime = '*';
  IF n <> 4 THEN RAISE EXCEPTION '[b-xstock-fee-contract] expected 4 fee_model rows, found %', n; END IF;

  FOR r IN SELECT * FROM (VALUES
      ('xstock_spot', 'spot_taker_fee', 0.0010::numeric),
      ('xstock_spot', 'spot_maker_fee', -0.0002::numeric),
      ('crypto_spot', 'spot_taker_fee', 0.008::numeric),
      ('crypto_spot', 'spot_maker_fee', 0.004::numeric)) AS t(asset_class, constant_name, expected)
  LOOP
    SELECT (value)::text::numeric INTO v FROM module_constants
    WHERE module_name = 'fee_model' AND exchange = '*' AND strategy = '*' AND regime = '*'
      AND asset_class = r.asset_class AND constant_name = r.constant_name;
    IF v IS DISTINCT FROM r.expected THEN
      RAISE EXCEPTION '[b-xstock-fee-contract] fee_model %.% = % (expected %)', r.asset_class, r.constant_name, v, r.expected;
    END IF;
  END LOOP;

  -- P4: cost_model gone; both ledger rows corrected.
  SELECT count(*) INTO n FROM module_constants WHERE module_name = 'cost_model';
  IF n <> 0 THEN RAISE EXCEPTION '[b-xstock-fee-contract] cost_model still has % rows', n; END IF;

  SELECT count(*) INTO n FROM calibration_ledger
  WHERE sub_batch = 'B.0' AND asset_class = 'xstock_spot' AND scope = 'friction'
    AND ((setting_key = 'feeRateTaker' AND current_value = '0.10%') OR (setting_key = 'feeRateMaker' AND current_value = '-0.02%'));
  IF n <> 2 THEN RAISE EXCEPTION '[b-xstock-fee-contract] expected 2 corrected calibration_ledger fee rows, found %', n; END IF;

  -- P6: exactly the two xStock rows moved, by exactly +1; nothing else moved.
  SELECT count(*) INTO n FROM _bxfc_epoch_before WHERE asset_class = 'xstock_spot' AND constant_name IN ('vts', 'paper_sim');
  IF n <> 2 THEN RAISE EXCEPTION '[b-xstock-fee-contract] expected xstock_spot vts + paper_sim epoch rows before the bump, found %', n; END IF;

  FOR r IN
    SELECT b.asset_class, b.constant_name, b.v AS pre, (m.value)::text::numeric AS post
    FROM _bxfc_epoch_before b
    JOIN module_constants m
      ON m.module_name = 'calibration_epoch' AND m.exchange = '*' AND m.strategy = '*' AND m.regime = '*'
     AND m.asset_class = b.asset_class AND m.constant_name = b.constant_name
  LOOP
    IF r.asset_class = 'xstock_spot' AND r.constant_name IN ('vts', 'paper_sim') THEN
      IF r.post <> r.pre + 1 THEN
        RAISE EXCEPTION '[b-xstock-fee-contract] epoch %/% moved % -> % (expected +1)', r.constant_name, r.asset_class, r.pre, r.post;
      END IF;
    ELSIF r.post <> r.pre THEN
      RAISE EXCEPTION '[b-xstock-fee-contract] epoch %/% moved % -> % (only xStock vts and paper_sim may move)', r.constant_name, r.asset_class, r.pre, r.post;
    END IF;
  END LOOP;

  SELECT (value)::text::numeric INTO v FROM module_constants
  WHERE module_name = 'calibration_epoch' AND exchange = '*' AND asset_class = 'xstock_spot'
    AND strategy = '*' AND regime = '*' AND constant_name = 'live' AND updated_by = 'b-xstock-fee-contract';
  SELECT (value)::text::numeric INTO base FROM module_constants
  WHERE module_name = 'calibration_epoch' AND exchange = '*' AND asset_class = '*'
    AND strategy = '*' AND regime = '*' AND constant_name = 'live';
  IF v IS NULL OR base IS NULL OR v <> base + 1 THEN
    RAISE EXCEPTION '[b-xstock-fee-contract] live/xstock_spot epoch = % (expected live/* + 1 = %, created by this migration)', v, base + 1;
  END IF;
END $$;

COMMIT;

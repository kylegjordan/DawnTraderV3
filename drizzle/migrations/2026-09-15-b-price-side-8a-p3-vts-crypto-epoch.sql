-- B-PRICE-SIDE-BY-JOB row 8a-P3 (PHASE_19_PLAN 3n.q, crypto half) — VTS CRYPTO rows change meaning.
-- Audit + plan: Claude Comms and Packages/Scope Files/B_PRICE_SIDE_BY_JOB_8A_P3_SCOPE_AUDIT_AND_PLAN.md (P6).
--
-- From this deploy, VTS crypto resting entries fill on the ASK (not the midpoint), VTS crypto stops/targets are
-- decided on the BID, and VTS crypto exits are BOOKED at the bid. Rows before and after mean different things, so the
-- VTS crypto calibration epoch moves by one and learning aggregates reset rather than blend (calibration-epoch.ts).
-- BUMP SCOPE: vts / crypto_spot ONLY. Paper and live epochs do not move (paper's decision change is not a calibration
-- substrate change for them), and xStock does not move (its half is 8a-P4). Every other epoch row is asserted unchanged
-- against its own pre-image — a DELTA, because absolute values differ between staging and a fresh CI database.
-- The calibration_epoch/crypto_spot/vts row is seeded by 2026-06-12a-b5-evgap-units-epoch.sql.
--
-- ONE TRANSACTION. A post-condition failure rolls it all back, fails db:migrate, and stops dt-deploy before restart.
-- ⛔ ROLLBACK: run 2026-09-15-b-price-side-8a-p3-vts-crypto-epoch-rollback.sql BY HAND before deploying a pre-batch sha.

BEGIN;

DROP TABLE IF EXISTS _p3_epoch_before;
CREATE TEMP TABLE _p3_epoch_before ON COMMIT DROP AS
SELECT asset_class, constant_name, (value)::text::numeric AS v
FROM module_constants
WHERE module_name = 'calibration_epoch' AND exchange = '*' AND strategy = '*' AND regime = '*';

UPDATE module_constants
SET value = to_jsonb((value)::text::numeric + 1), updated_by = 'b-price-side-8a-p3'
WHERE module_name = 'calibration_epoch' AND exchange = '*' AND strategy = '*' AND regime = '*'
  AND asset_class = 'crypto_spot' AND constant_name = 'vts';

DO $$
DECLARE
  n int;
  bad int;
BEGIN
  SELECT count(*) INTO n FROM _p3_epoch_before WHERE asset_class = 'crypto_spot' AND constant_name = 'vts';
  IF n <> 1 THEN
    RAISE EXCEPTION '[8a-P3 epoch] expected exactly one calibration_epoch/crypto_spot/vts row, found %', n;
  END IF;
  SELECT count(*) INTO bad
  FROM _p3_epoch_before b
  JOIN module_constants m
    ON m.module_name = 'calibration_epoch' AND m.exchange = '*' AND m.strategy = '*' AND m.regime = '*'
   AND m.asset_class = b.asset_class AND m.constant_name = b.constant_name
  WHERE (m.value)::text::numeric IS DISTINCT FROM
        b.v + CASE WHEN b.asset_class = 'crypto_spot' AND b.constant_name = 'vts' THEN 1 ELSE 0 END;
  IF bad <> 0 THEN
    RAISE EXCEPTION '[8a-P3 epoch] % epoch row(s) moved wrongly — only vts/crypto_spot may move, by exactly +1', bad;
  END IF;
END $$;

COMMIT;

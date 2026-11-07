-- B-PRICE-SIDE-BY-JOB KD-19 (b) + (c) exit leg (plan row 17) — the VTS learning population changes meaning, BOTH classes.
-- Record: Claude Comms and Packages/Scope Files/B_PRICE_SIDE_BY_JOB_KD19_PRE_AUDIT.md (P8; objective K5).
--
-- WHAT CHANGES, PER SOURCE:
--   vts / crypto_spot  — real-lane VTS exits are booked by the order-book walk paper uses (`closeFillFull`) over the levels
--                        the exit trigger saw; a short top now prices its remainder at the 50 bps beyond-depth penalty, and
--                        the 0.05 % exit slippage allowance leaves every leg whose size was certain.            ⇒ +1
--   vts / xstock_spot  — the same rule over the guarded row's sized bid.                                       ⇒ +1
--   paper_sim / *      — NOT moved: paper's booked price is byte-identical (P1 only returns the split it already computed).
--   live / *           — not moved.
-- Every other epoch row is asserted unchanged against its own pre-image. `updated_at` IS set on the moved rows
-- (`ADJUSTMENT_FRAMEWORK` epoch rule 7: date the boundary by the DEPLOY, which this stamp tracks).
--
-- ONE TRANSACTION. A post-condition failure rolls it all back, fails db:migrate, and stops dt-deploy before restart.
-- ⛔ ROLLBACK: run 2026-11-07-b-price-side-kd19-vts-epoch-rollback.sql BY HAND before deploying a pre-KD-19 sha.

BEGIN;

DROP TABLE IF EXISTS _kd19_epoch_before;
CREATE TEMP TABLE _kd19_epoch_before ON COMMIT DROP AS
SELECT asset_class, constant_name, (value)::text::numeric AS v
FROM module_constants
WHERE module_name = 'calibration_epoch' AND exchange = '*' AND strategy = '*' AND regime = '*';

UPDATE module_constants
SET value = to_jsonb((value)::text::numeric + 1), updated_by = 'b-price-side-kd19', updated_at = now()
WHERE module_name = 'calibration_epoch' AND exchange = '*' AND strategy = '*' AND regime = '*'
  AND asset_class IN ('crypto_spot', 'xstock_spot') AND constant_name = 'vts';

DO $$
DECLARE
  n int;
  bad int;
BEGIN
  SELECT count(*) INTO n FROM _kd19_epoch_before
  WHERE asset_class IN ('crypto_spot', 'xstock_spot') AND constant_name = 'vts';
  IF n <> 2 THEN
    RAISE EXCEPTION '[KD-19 epoch] expected exactly the crypto_spot and xstock_spot vts rows, found %', n;
  END IF;
  SELECT count(*) INTO bad
  FROM _kd19_epoch_before b
  JOIN module_constants m
    ON m.module_name = 'calibration_epoch' AND m.exchange = '*' AND m.strategy = '*' AND m.regime = '*'
   AND m.asset_class = b.asset_class AND m.constant_name = b.constant_name
  WHERE (m.value)::text::numeric IS DISTINCT FROM
        b.v + CASE WHEN b.asset_class IN ('crypto_spot', 'xstock_spot') AND b.constant_name = 'vts' THEN 1 ELSE 0 END;
  IF bad <> 0 THEN
    RAISE EXCEPTION '[KD-19 epoch] % epoch row(s) moved wrongly — only the two vts rows may move, by exactly +1', bad;
  END IF;
END $$;

COMMIT;

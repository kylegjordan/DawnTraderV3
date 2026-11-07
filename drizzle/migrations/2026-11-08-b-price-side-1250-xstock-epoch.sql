-- B-PRICE-SIDE-BY-JOB #1250 (row 17) — xStock taker stop and target on the price paid; the stop-distance floor at the fill.
-- Record: Claude Comms and Packages/Scope Files/B_PRICE_SIDE_BY_JOB_1250_PRE_AUDIT.md (P6; OBJ-4).
--
-- WHAT CHANGES, PER SOURCE:
--   paper_sim / xstock_spot  — a taker open's distance / R-multiple / proportional levels follow the price paid (anchors keep
--                              their price), the fill economics judge the carried levels, and a carried stop under 0.3 % of the
--                              fill is refused (STOP_DISTANCE_AT_FILL).                                              ⇒ +1
--   vts / xstock_spot        — the same rule and floor on the VTS xStock taker, at its booked ask.                     ⇒ +1
--   crypto_spot / *, live / * — NOT moved (crypto levels are row 8c's; live is not running).
-- Every other epoch row is asserted unchanged against its own pre-image. `updated_at` IS set on the moved rows
-- (`ADJUSTMENT_FRAMEWORK` epoch rule 7: date the boundary by the DEPLOY, which this stamp tracks).
--
-- ONE TRANSACTION. A post-condition failure rolls it all back, fails db:migrate, and stops dt-deploy before restart.
-- ⛔ ROLLBACK: run 2026-11-08-b-price-side-1250-xstock-epoch-rollback.sql BY HAND before deploying a pre-#1250 sha.

BEGIN;

DROP TABLE IF EXISTS _b1250_epoch_before;
CREATE TEMP TABLE _b1250_epoch_before ON COMMIT DROP AS
SELECT asset_class, constant_name, (value)::text::numeric AS v
FROM module_constants
WHERE module_name = 'calibration_epoch' AND exchange = '*' AND strategy = '*' AND regime = '*';

UPDATE module_constants
SET value = to_jsonb((value)::text::numeric + 1), updated_by = 'b-price-side-1250', updated_at = now()
WHERE module_name = 'calibration_epoch' AND exchange = '*' AND strategy = '*' AND regime = '*'
  AND asset_class = 'xstock_spot' AND constant_name IN ('paper_sim', 'vts');

DO $$
DECLARE
  n int;
  bad int;
BEGIN
  SELECT count(*) INTO n FROM _b1250_epoch_before
  WHERE asset_class = 'xstock_spot' AND constant_name IN ('paper_sim', 'vts');
  IF n <> 2 THEN
    RAISE EXCEPTION '[#1250 epoch] expected exactly the xstock_spot paper_sim and vts rows, found %', n;
  END IF;
  SELECT count(*) INTO bad
  FROM _b1250_epoch_before b
  JOIN module_constants m
    ON m.module_name = 'calibration_epoch' AND m.exchange = '*' AND m.strategy = '*' AND m.regime = '*'
   AND m.asset_class = b.asset_class AND m.constant_name = b.constant_name
  WHERE (m.value)::text::numeric IS DISTINCT FROM
        b.v + CASE WHEN b.asset_class = 'xstock_spot' AND b.constant_name IN ('paper_sim', 'vts') THEN 1 ELSE 0 END;
  IF bad <> 0 THEN
    RAISE EXCEPTION '[#1250 epoch] % epoch row(s) moved wrongly — only the two xstock_spot rows may move, by exactly +1', bad;
  END IF;
END $$;

COMMIT;

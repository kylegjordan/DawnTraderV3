-- B-PRICE-SIDE-BY-JOB row 8a-P4b, Step 9 C1 (Langston, 2026-09-19) — the PAPER xSTOCK learning population changes
-- meaning a third time.
-- Record: Claude Comms and Packages/Scope Files/B_PRICE_SIDE_BY_JOB_8A_P4B_AUDIT_AND_PLAN.md §L (the containment gate).
--
-- WHAT CHANGES, PER SOURCE:
--   paper_sim / xstock_spot — the stop/target TRIGGER returns to the mark (8a-P4b X3 had moved it to the guard-validated
--                             bid; a symmetric-blowout stub bid fired a false stop on MDB/USD). The resting fills stay on
--                             the sides (X1 ask, X2 bid). A third composition: the 8a-P4b rows and the C1 rows must not
--                             blend.                                                                         ⇒ +1
--   vts / xstock_spot       — NOT moved. The C1 revert does not touch `_vtsTriggerPrice`, and the J5 lane keying stays,
--                             so nothing about the VTS xStock population changes at this deploy.
--   live / *, crypto rows   — not moved.
-- Every other epoch row is asserted unchanged against its own pre-image (a DELTA). ⭐ `updated_at` IS SET on the moved
-- row (Langston 8a-P4b Step 8 FINDING-1: the 8a-P3 and 8a-P4b epoch migrations left it stale, so an unchanged
-- `updated_at` in this table is not evidence of no-write). Forward only: the two known-stale stamps are not retro-dated.
--
-- ONE TRANSACTION. A post-condition failure rolls it all back, fails db:migrate, and stops dt-deploy before restart.
-- ⛔ ROLLBACK: run 2026-09-19-b-price-side-8a-p4b-c1-paper-xstock-epoch-rollback.sql BY HAND before deploying a pre-C1 sha.

BEGIN;

DROP TABLE IF EXISTS _p4bc1_epoch_before;
CREATE TEMP TABLE _p4bc1_epoch_before ON COMMIT DROP AS
SELECT asset_class, constant_name, (value)::text::numeric AS v
FROM module_constants
WHERE module_name = 'calibration_epoch' AND exchange = '*' AND strategy = '*' AND regime = '*';

UPDATE module_constants
SET value = to_jsonb((value)::text::numeric + 1), updated_by = 'b-price-side-8a-p4b-c1', updated_at = now()
WHERE module_name = 'calibration_epoch' AND exchange = '*' AND strategy = '*' AND regime = '*'
  AND asset_class = 'xstock_spot' AND constant_name = 'paper_sim';

DO $$
DECLARE
  n int;
  bad int;
BEGIN
  SELECT count(*) INTO n FROM _p4bc1_epoch_before WHERE asset_class = 'xstock_spot' AND constant_name = 'paper_sim';
  IF n <> 1 THEN
    RAISE EXCEPTION '[8a-P4b C1 epoch] expected exactly the calibration_epoch/xstock_spot paper_sim row, found %', n;
  END IF;

  -- xstock_spot paper_sim moved by exactly +1; every OTHER row (incl. xstock_spot vts) did not move.
  SELECT count(*) INTO bad
  FROM _p4bc1_epoch_before b
  JOIN module_constants m
    ON m.module_name = 'calibration_epoch' AND m.exchange = '*' AND m.strategy = '*' AND m.regime = '*'
   AND m.asset_class = b.asset_class AND m.constant_name = b.constant_name
  WHERE (m.value)::text::numeric IS DISTINCT FROM
        b.v + CASE WHEN b.asset_class = 'xstock_spot' AND b.constant_name = 'paper_sim' THEN 1 ELSE 0 END;
  IF bad <> 0 THEN
    RAISE EXCEPTION '[8a-P4b C1 epoch] % epoch row(s) moved wrongly — only xstock_spot paper_sim may move, by exactly +1', bad;
  END IF;
END $$;

COMMIT;

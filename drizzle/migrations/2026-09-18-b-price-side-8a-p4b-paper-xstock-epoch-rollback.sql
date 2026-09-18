-- ROLLBACK for 2026-09-18-b-price-side-8a-p4b-paper-xstock-epoch.sql — RUN BY HAND, before deploying a pre-batch sha.
--
-- ⛔ AN EPOCH ONLY MOVES FORWARD. Rolling the code back changes the meaning of the paper xStock rows AGAIN (the trigger and
-- the resting fills return to the mark), so this bumps xstock_spot paper_sim AND vts by +1 once more rather than decrementing —
-- a decrement would re-join post-rollback rows to a pre-batch epoch they no longer match in time.
-- ⛔ IT DELETES THE FORWARD MIGRATION'S `_migrations` ROW (column `name`, scripts/db-migrate.ts), so a later redeploy of
-- the batch runs the forward file again and bumps again.

BEGIN;

DROP TABLE IF EXISTS _p4brb_epoch_before;
CREATE TEMP TABLE _p4brb_epoch_before ON COMMIT DROP AS
SELECT asset_class, constant_name, (value)::text::numeric AS v
FROM module_constants
WHERE module_name = 'calibration_epoch' AND exchange = '*' AND strategy = '*' AND regime = '*';

UPDATE module_constants
SET value = to_jsonb((value)::text::numeric + 1), updated_by = 'b-price-side-8a-p4b-rollback'
WHERE module_name = 'calibration_epoch' AND exchange = '*' AND strategy = '*' AND regime = '*'
  AND asset_class = 'xstock_spot' AND constant_name IN ('paper_sim', 'vts');

DELETE FROM _migrations WHERE name = '2026-09-18-b-price-side-8a-p4b-paper-xstock-epoch.sql';

DO $$
DECLARE
  n int;
  bad int;
BEGIN
  SELECT count(*) INTO n FROM _p4brb_epoch_before WHERE asset_class = 'xstock_spot' AND constant_name IN ('paper_sim', 'vts');
  IF n <> 2 THEN RAISE EXCEPTION '[8a-P4b epoch rollback] expected the xstock_spot paper_sim and vts rows, found %', n; END IF;
  SELECT count(*) INTO n FROM _migrations WHERE name = '2026-09-18-b-price-side-8a-p4b-paper-xstock-epoch.sql';
  IF n <> 0 THEN RAISE EXCEPTION '[8a-P4b epoch rollback] the forward migration is still recorded in _migrations'; END IF;
  SELECT count(*) INTO bad
  FROM _p4brb_epoch_before b
  JOIN module_constants m
    ON m.module_name = 'calibration_epoch' AND m.exchange = '*' AND m.strategy = '*' AND m.regime = '*'
   AND m.asset_class = b.asset_class AND m.constant_name = b.constant_name
  WHERE (m.value)::text::numeric IS DISTINCT FROM
        b.v + CASE WHEN b.asset_class = 'xstock_spot' AND b.constant_name IN ('paper_sim', 'vts') THEN 1 ELSE 0 END;
  IF bad <> 0 THEN RAISE EXCEPTION '[8a-P4b epoch rollback] % epoch row(s) moved wrongly', bad; END IF;
END $$;

COMMIT;

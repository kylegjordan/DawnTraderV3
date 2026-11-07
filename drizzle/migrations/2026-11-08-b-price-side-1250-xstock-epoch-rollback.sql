-- ROLLBACK for 2026-11-08-b-price-side-1250-xstock-epoch.sql — RUN BY HAND, before deploying a pre-#1250 sha.
--
-- ⛔ AN EPOCH ONLY MOVES FORWARD. Rolling #1250 back returns xStock taker levels to the decision price and removes the floor at
-- the fill, which changes the meaning of the rows AGAIN, so this bumps both rows by +1 once more rather than decrementing.
-- ⛔ IT DELETES THE FORWARD MIGRATION'S `_migrations` ROW, so a later redeploy of #1250 runs the forward file again.

BEGIN;

DROP TABLE IF EXISTS _b1250rb_epoch_before;
CREATE TEMP TABLE _b1250rb_epoch_before ON COMMIT DROP AS
SELECT asset_class, constant_name, (value)::text::numeric AS v
FROM module_constants
WHERE module_name = 'calibration_epoch' AND exchange = '*' AND strategy = '*' AND regime = '*';

UPDATE module_constants
SET value = to_jsonb((value)::text::numeric + 1), updated_by = 'b-price-side-1250-rollback', updated_at = now()
WHERE module_name = 'calibration_epoch' AND exchange = '*' AND strategy = '*' AND regime = '*'
  AND asset_class = 'xstock_spot' AND constant_name IN ('paper_sim', 'vts');

DELETE FROM _migrations WHERE name = '2026-11-08-b-price-side-1250-xstock-epoch.sql';

DO $$
DECLARE
  n int;
  bad int;
BEGIN
  SELECT count(*) INTO n FROM _b1250rb_epoch_before WHERE asset_class = 'xstock_spot' AND constant_name IN ('paper_sim', 'vts');
  IF n <> 2 THEN RAISE EXCEPTION '[#1250 epoch rollback] expected the two xstock_spot rows, found %', n; END IF;
  SELECT count(*) INTO n FROM _migrations WHERE name = '2026-11-08-b-price-side-1250-xstock-epoch.sql';
  IF n <> 0 THEN RAISE EXCEPTION '[#1250 epoch rollback] the forward migration is still recorded in _migrations'; END IF;
  SELECT count(*) INTO bad
  FROM _b1250rb_epoch_before b
  JOIN module_constants m
    ON m.module_name = 'calibration_epoch' AND m.exchange = '*' AND m.strategy = '*' AND m.regime = '*'
   AND m.asset_class = b.asset_class AND m.constant_name = b.constant_name
  WHERE (m.value)::text::numeric IS DISTINCT FROM
        b.v + CASE WHEN b.asset_class = 'xstock_spot' AND b.constant_name IN ('paper_sim', 'vts') THEN 1 ELSE 0 END;
  IF bad <> 0 THEN RAISE EXCEPTION '[#1250 epoch rollback] % epoch row(s) moved wrongly', bad; END IF;
END $$;

COMMIT;

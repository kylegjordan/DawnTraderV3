-- ROLLBACK for 2026-11-07-b-price-side-kd19-vts-epoch.sql — RUN BY HAND, before deploying a pre-KD-19 sha.
--
-- ⛔ AN EPOCH ONLY MOVES FORWARD. Rolling KD-19 back returns VTS exits to the top bid plus the allowance, which changes the
-- meaning of the rows AGAIN, so this bumps both vts rows by +1 once more rather than decrementing.
-- ⛔ IT DELETES THE FORWARD MIGRATION'S `_migrations` ROW, so a later redeploy of KD-19 runs the forward file again.

BEGIN;

DROP TABLE IF EXISTS _kd19rb_epoch_before;
CREATE TEMP TABLE _kd19rb_epoch_before ON COMMIT DROP AS
SELECT asset_class, constant_name, (value)::text::numeric AS v
FROM module_constants
WHERE module_name = 'calibration_epoch' AND exchange = '*' AND strategy = '*' AND regime = '*';

UPDATE module_constants
SET value = to_jsonb((value)::text::numeric + 1), updated_by = 'b-price-side-kd19-rollback', updated_at = now()
WHERE module_name = 'calibration_epoch' AND exchange = '*' AND strategy = '*' AND regime = '*'
  AND asset_class IN ('crypto_spot', 'xstock_spot') AND constant_name = 'vts';

DELETE FROM _migrations WHERE name = '2026-11-07-b-price-side-kd19-vts-epoch.sql';

DO $$
DECLARE
  n int;
  bad int;
BEGIN
  SELECT count(*) INTO n FROM _kd19rb_epoch_before WHERE asset_class IN ('crypto_spot', 'xstock_spot') AND constant_name = 'vts';
  IF n <> 2 THEN RAISE EXCEPTION '[KD-19 epoch rollback] expected the two vts rows, found %', n; END IF;
  SELECT count(*) INTO n FROM _migrations WHERE name = '2026-11-07-b-price-side-kd19-vts-epoch.sql';
  IF n <> 0 THEN RAISE EXCEPTION '[KD-19 epoch rollback] the forward migration is still recorded in _migrations'; END IF;
  SELECT count(*) INTO bad
  FROM _kd19rb_epoch_before b
  JOIN module_constants m
    ON m.module_name = 'calibration_epoch' AND m.exchange = '*' AND m.strategy = '*' AND m.regime = '*'
   AND m.asset_class = b.asset_class AND m.constant_name = b.constant_name
  WHERE (m.value)::text::numeric IS DISTINCT FROM
        b.v + CASE WHEN b.asset_class IN ('crypto_spot', 'xstock_spot') AND b.constant_name = 'vts' THEN 1 ELSE 0 END;
  IF bad <> 0 THEN RAISE EXCEPTION '[KD-19 epoch rollback] % epoch row(s) moved wrongly', bad; END IF;
END $$;

COMMIT;

-- OPERATOR-ONLY rollback for 2026-09-11-b-xstock-fee-contract.sql. NEVER listed in MANIFEST.txt.
--
-- ⛔ RUN IT EXACTLY LIKE THIS, as deploy with the env sourced:   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f <this file>
--    Without ON_ERROR_STOP a failed check still lets psql exit 0, and the pre-batch deploy that follows would refuse to
--    boot on zero `cost_model` rows. THEN dt-deploy the pre-batch sha. dt-deploy has no rollback verb and migrates
--    forward only; pre-batch code prefetches 'cost_model' and refuses to boot while that module has zero rows.
--
-- ⛔ IT REFUSES TO OVERWRITE A LATER FEE CHANGE. It proceeds only when xStock is on this batch's pair (0.0010 / -0.0002)
--    or already on the restored pair (0.008 / 0.004 — a harmless re-run). Any other value means a later batch changed
--    the xStock fees, and rolling this batch back would silently overwrite that; the guard block raises instead.
--
-- WHAT IT RESTORES: the five cost_model rows (literal values as they stood on staging 2026-09-11),
-- the xStock fee pair 0.008 / 0.004, and the two calibration_ledger fee rows.
--
-- ⛔ IT DELETES THE FORWARD MIGRATION'S `_migrations` ROW (column `name`, scripts/db-migrate.ts:66).
--    Without that, a later redeploy of the batch sha would SKIP the forward migration (db-migrate.ts:155) and
--    xStock would boot on 0.008 / 0.004 — values the signed rail accepts, so nothing would refuse.
--
-- ★ EPOCHS: it bumps the xStock vts, paper_sim and live epochs by +1 EXACTLY WHEN THIS RUN CHANGES THE xSTOCK FEE PAIR.
--   Restoring the old fees is itself a fee change, so it is an epoch boundary: outcomes booked under the new fees and
--   outcomes booked under the restored ones must never share an epoch (calibration-epoch.ts: aggregates reset on
--   mismatch). A re-run that changes nothing moves nothing. Epochs only ever step FORWARD — stepping one back would
--   re-join pre-change and post-change outcomes.

BEGIN;

DROP TABLE IF EXISTS _bxfc_rb_fee_before;
CREATE TEMP TABLE _bxfc_rb_fee_before ON COMMIT DROP AS
SELECT constant_name, (value)::text::numeric AS v
FROM module_constants
WHERE module_name = 'fee_model' AND exchange = '*' AND asset_class = 'xstock_spot' AND strategy = '*' AND regime = '*'
  AND constant_name IN ('spot_taker_fee', 'spot_maker_fee');

-- GUARD: refuse to overwrite a fee pair this batch did not write.
DO $$
DECLARE
  tk numeric;
  mk numeric;
BEGIN
  SELECT v INTO tk FROM _bxfc_rb_fee_before WHERE constant_name = 'spot_taker_fee';
  SELECT v INTO mk FROM _bxfc_rb_fee_before WHERE constant_name = 'spot_maker_fee';
  IF tk IS NULL OR mk IS NULL OR NOT ((tk = 0.0010 AND mk = -0.0002) OR (tk = 0.008 AND mk = 0.004)) THEN
    RAISE EXCEPTION '[b-xstock-fee-contract rollback] xStock fees are % / %, neither this batch''s 0.0010 / -0.0002 nor the restored 0.008 / 0.004; a later fee change would be overwritten, refusing', tk, mk;
  END IF;
END $$;

DROP TABLE IF EXISTS _bxfc_rb_fee_changed;
CREATE TEMP TABLE _bxfc_rb_fee_changed ON COMMIT DROP AS
SELECT EXISTS (
  SELECT 1 FROM _bxfc_rb_fee_before f
  WHERE (f.constant_name = 'spot_taker_fee' AND f.v IS DISTINCT FROM 0.008)
     OR (f.constant_name = 'spot_maker_fee' AND f.v IS DISTINCT FROM 0.004)
) AS changed;

DROP TABLE IF EXISTS _bxfc_rb_epoch_before;
CREATE TEMP TABLE _bxfc_rb_epoch_before ON COMMIT DROP AS
SELECT constant_name, asset_class, (value)::text::numeric AS v
FROM module_constants
WHERE module_name = 'calibration_epoch' AND exchange = '*' AND strategy = '*' AND regime = '*';

INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('cost_model', '*',      '*', '*', '*', 'default_avg_return', '0.005'::jsonb,  'b72-step3-commit-b'),
  ('cost_model', 'kraken', '*', '*', '*', 'default_taker_fee',  '0.0026'::jsonb, 'b72-step3-commit-b'),
  ('cost_model', 'kraken', '*', '*', '*', 'default_slippage',   '0.0005'::jsonb, 'b72-step3-commit-b'),
  ('cost_model', 'kraken', '*', '*', '*', 'default_spread',     '0.0010'::jsonb, 'b72-step3-commit-b'),
  ('cost_model', 'kraken', '*', '*', '*', 'max_cost_bound',     '0.01'::jsonb,   'b72-step3-commit-b')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

UPDATE module_constants SET value = '0.008'::jsonb, updated_by = 'b45-tier1-seed', updated_at = NOW()
WHERE module_name = 'fee_model' AND exchange = '*' AND asset_class = 'xstock_spot'
  AND strategy = '*' AND regime = '*' AND constant_name = 'spot_taker_fee';

UPDATE module_constants SET value = '0.004'::jsonb, updated_by = 'b45-tier1-seed', updated_at = NOW()
WHERE module_name = 'fee_model' AND exchange = '*' AND asset_class = 'xstock_spot'
  AND strategy = '*' AND regime = '*' AND constant_name = 'spot_maker_fee';

UPDATE calibration_ledger SET current_value = '0.26%', notes = 'Kraken spot taker; calibrate per observed fills.', updated_at = NOW()
WHERE sub_batch = 'B.0' AND asset_class = 'xstock_spot' AND setting_key = 'feeRateTaker' AND scope = 'friction';

UPDATE calibration_ledger SET current_value = '0.16%', notes = 'Kraken spot maker.', updated_at = NOW()
WHERE sub_batch = 'B.0' AND asset_class = 'xstock_spot' AND setting_key = 'feeRateMaker' AND scope = 'friction';

UPDATE module_constants mc
SET value = to_jsonb((mc.value)::text::numeric + 1), updated_by = 'b-xstock-fee-contract-rollback', updated_at = NOW()
WHERE mc.module_name = 'calibration_epoch' AND mc.exchange = '*' AND mc.strategy = '*' AND mc.regime = '*'
  AND mc.asset_class = 'xstock_spot' AND mc.constant_name IN ('vts', 'paper_sim', 'live')
  AND (SELECT changed FROM _bxfc_rb_fee_changed);

DELETE FROM _migrations WHERE name = '2026-09-11-b-xstock-fee-contract.sql';

DO $$
DECLARE
  n int;
  d int;
  r record;
BEGIN
  SELECT CASE WHEN changed THEN 1 ELSE 0 END INTO d FROM _bxfc_rb_fee_changed;

  SELECT count(*) INTO n FROM module_constants WHERE module_name = 'cost_model';
  IF n <> 5 THEN RAISE EXCEPTION '[b-xstock-fee-contract rollback] expected 5 cost_model rows, found %', n; END IF;
  SELECT count(*) INTO n FROM module_constants
  WHERE module_name = 'fee_model' AND exchange = '*' AND asset_class = 'xstock_spot' AND strategy = '*' AND regime = '*'
    AND ((constant_name = 'spot_taker_fee' AND (value)::text::numeric = 0.008)
      OR (constant_name = 'spot_maker_fee' AND (value)::text::numeric = 0.004));
  IF n <> 2 THEN RAISE EXCEPTION '[b-xstock-fee-contract rollback] xStock fee rows not restored (% of 2)', n; END IF;
  SELECT count(*) INTO n FROM calibration_ledger
  WHERE sub_batch = 'B.0' AND asset_class = 'xstock_spot' AND scope = 'friction'
    AND ((setting_key = 'feeRateTaker' AND current_value = '0.26%') OR (setting_key = 'feeRateMaker' AND current_value = '0.16%'));
  IF n <> 2 THEN RAISE EXCEPTION '[b-xstock-fee-contract rollback] calibration_ledger fee rows not restored (% of 2)', n; END IF;
  SELECT count(*) INTO n FROM _migrations WHERE name = '2026-09-11-b-xstock-fee-contract.sql';
  IF n <> 0 THEN RAISE EXCEPTION '[b-xstock-fee-contract rollback] the forward migration is still recorded in _migrations'; END IF;

  -- Epochs: when this run changed the fee pair, the three xStock rows (the forward migration created live) moved by
  -- exactly +1; otherwise nothing moved. Nothing else moves either way.
  IF d = 1 THEN
    SELECT count(*) INTO n FROM _bxfc_rb_epoch_before WHERE asset_class = 'xstock_spot' AND constant_name IN ('vts', 'paper_sim', 'live');
    IF n <> 3 THEN RAISE EXCEPTION '[b-xstock-fee-contract rollback] expected xStock vts, paper_sim and live epoch rows, found %', n; END IF;
  END IF;
  FOR r IN
    SELECT b.asset_class, b.constant_name, b.v AS pre, (m.value)::text::numeric AS post
    FROM _bxfc_rb_epoch_before b
    LEFT JOIN module_constants m
      ON m.module_name = 'calibration_epoch' AND m.exchange = '*' AND m.strategy = '*' AND m.regime = '*'
     AND m.asset_class = b.asset_class AND m.constant_name = b.constant_name
  LOOP
    IF r.asset_class = 'xstock_spot' AND r.constant_name IN ('vts', 'paper_sim', 'live') THEN
      IF r.post IS DISTINCT FROM r.pre + d THEN
        RAISE EXCEPTION '[b-xstock-fee-contract rollback] epoch %/% moved % -> % (expected +%)', r.constant_name, r.asset_class, r.pre, r.post, d;
      END IF;
    ELSIF r.post IS DISTINCT FROM r.pre THEN
      RAISE EXCEPTION '[b-xstock-fee-contract rollback] epoch %/% moved % -> % (only xStock vts, paper_sim and live may move)', r.constant_name, r.asset_class, r.pre, r.post;
    END IF;
  END LOOP;
END $$;

COMMIT;

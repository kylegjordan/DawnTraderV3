-- OPERATOR-ONLY rollback for 2026-09-11-b-xstock-fee-contract.sql. NEVER listed in MANIFEST.txt.
--
-- ⛔ ORDER MATTERS: run THIS FIRST (psql -f, as deploy, env sourced), THEN dt-deploy the pre-batch sha.
--    dt-deploy has no rollback verb and migrates forward only; pre-batch code prefetches 'cost_model'
--    and refuses to boot while that module has zero rows.
--
-- WHAT IT RESTORES: the five cost_model rows (literal values as they stood on staging 2026-09-11),
-- the xStock fee pair 0.008 / 0.004, and the two calibration_ledger fee rows.
--
-- ⛔ IT DELETES THE FORWARD MIGRATION'S `_migrations` ROW (column `name`, scripts/db-migrate.ts:66).
--    Without that, a later redeploy of the batch sha would SKIP the forward migration (db-migrate.ts:155) and
--    xStock would boot on 0.008 / 0.004 — values the signed rail accepts, so nothing would refuse.
--
-- ★ IT BUMPS THE xSTOCK EPOCHS AGAIN (vts, paper_sim, live +1). Restoring the old fees is itself a fee change, so it is
--   an epoch boundary: outcomes booked under the new fees and outcomes booked under the restored ones must never share
--   an epoch (calibration-epoch.ts: aggregates reset on mismatch). Epochs only ever step FORWARD — stepping one back
--   would re-join pre-change and post-change outcomes. A later redeploy of the batch bumps once more.

BEGIN;

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
  AND mc.asset_class = 'xstock_spot' AND mc.constant_name IN ('vts', 'paper_sim', 'live');

DELETE FROM _migrations WHERE name = '2026-09-11-b-xstock-fee-contract.sql';

DO $$
DECLARE
  n int;
  r record;
BEGIN
  SELECT count(*) INTO n FROM module_constants WHERE module_name = 'cost_model';
  IF n <> 5 THEN RAISE EXCEPTION '[b-xstock-fee-contract rollback] expected 5 cost_model rows, found %', n; END IF;
  SELECT count(*) INTO n FROM module_constants
  WHERE module_name = 'fee_model' AND asset_class = 'xstock_spot'
    AND ((constant_name = 'spot_taker_fee' AND (value)::text::numeric = 0.008)
      OR (constant_name = 'spot_maker_fee' AND (value)::text::numeric = 0.004));
  IF n <> 2 THEN RAISE EXCEPTION '[b-xstock-fee-contract rollback] xStock fee rows not restored (% of 2)', n; END IF;
  SELECT count(*) INTO n FROM _migrations WHERE name = '2026-09-11-b-xstock-fee-contract.sql';
  IF n <> 0 THEN RAISE EXCEPTION '[b-xstock-fee-contract rollback] the forward migration is still recorded in _migrations'; END IF;

  -- Epochs: the three xStock rows (the forward migration created live) moved by exactly +1; nothing else moved.
  SELECT count(*) INTO n FROM _bxfc_rb_epoch_before WHERE asset_class = 'xstock_spot' AND constant_name IN ('vts', 'paper_sim', 'live');
  IF n <> 3 THEN RAISE EXCEPTION '[b-xstock-fee-contract rollback] expected xStock vts, paper_sim and live epoch rows, found %', n; END IF;
  FOR r IN
    SELECT b.asset_class, b.constant_name, b.v AS pre, (m.value)::text::numeric AS post
    FROM _bxfc_rb_epoch_before b
    LEFT JOIN module_constants m
      ON m.module_name = 'calibration_epoch' AND m.exchange = '*' AND m.strategy = '*' AND m.regime = '*'
     AND m.asset_class = b.asset_class AND m.constant_name = b.constant_name
  LOOP
    IF r.asset_class = 'xstock_spot' AND r.constant_name IN ('vts', 'paper_sim', 'live') THEN
      IF r.post IS DISTINCT FROM r.pre + 1 THEN
        RAISE EXCEPTION '[b-xstock-fee-contract rollback] epoch %/% moved % -> % (expected +1)', r.constant_name, r.asset_class, r.pre, r.post;
      END IF;
    ELSIF r.post IS DISTINCT FROM r.pre THEN
      RAISE EXCEPTION '[b-xstock-fee-contract rollback] epoch %/% moved % -> % (only xStock vts, paper_sim and live may move)', r.constant_name, r.asset_class, r.pre, r.post;
    END IF;
  END LOOP;
END $$;

COMMIT;

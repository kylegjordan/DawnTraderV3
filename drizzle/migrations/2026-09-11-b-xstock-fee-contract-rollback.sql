-- OPERATOR-ONLY rollback for 2026-09-11-b-xstock-fee-contract.sql. NEVER listed in MANIFEST.txt.
--
-- ⛔ ORDER MATTERS: run THIS FIRST (psql -f, as deploy, env sourced), THEN dt-deploy the pre-batch sha.
--    dt-deploy has no rollback verb and migrates forward only; pre-batch code prefetches 'cost_model'
--    and refuses to boot while that module has zero rows.
--
-- WHAT IT RESTORES: the five cost_model rows (literal values as they stood on staging 2026-09-11),
-- the xStock fee pair 0.008 / 0.004, and the two calibration_ledger fee rows.
--
-- ⚠️ WHAT IT DELIBERATELY LEAVES: the xStock calibration epoch bump and the live/xstock_spot epoch row.
-- A fresh epoch boundary is never harmful — learning aggregates simply restart. Stepping an epoch BACK
-- would silently re-join pre-change and post-change outcomes, the mixing the epoch exists to prevent.
-- If a rollback is ever run, the epoch rows mark it as a second boundary; bump again on the next change.

BEGIN;

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

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM module_constants WHERE module_name = 'cost_model';
  IF n <> 5 THEN RAISE EXCEPTION '[b-xstock-fee-contract rollback] expected 5 cost_model rows, found %', n; END IF;
  SELECT count(*) INTO n FROM module_constants
  WHERE module_name = 'fee_model' AND asset_class = 'xstock_spot'
    AND ((constant_name = 'spot_taker_fee' AND (value)::text::numeric = 0.008)
      OR (constant_name = 'spot_maker_fee' AND (value)::text::numeric = 0.004));
  IF n <> 2 THEN RAISE EXCEPTION '[b-xstock-fee-contract rollback] xStock fee rows not restored (% of 2)', n; END IF;
END $$;

COMMIT;

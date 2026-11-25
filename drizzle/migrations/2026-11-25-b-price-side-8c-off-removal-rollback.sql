-- Manual staging recovery, outside the forward manifest. First deploy and prove exact Phase A live
-- with the three remaining rows. Phase B refuses to boot after the switch row is restored.
-- This restores the exact historical staging switch tuple measured before the forward cutover.
BEGIN;
SET LOCAL lock_timeout = '5s';
LOCK TABLE module_constants IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  total_rows int;
  retained_rows int;
BEGIN
  SELECT count(*), count(*) FILTER (
    WHERE exchange = '*' AND strategy = '*' AND regime = '*'
      AND (constant_name, value) IN (
        ('level_build_max_age_ms', '60000'::jsonb),
        ('level_build_max_spread_fraction', '0.50'::jsonb),
        ('level_build_drift_ref_60s', '0.00429'::jsonb)
      )
  ) INTO total_rows, retained_rows FROM module_constants
  WHERE module_name = 'level_basis' AND asset_class = 'crypto_spot';

  IF total_rows <> 3 OR retained_rows <> 3 THEN
    RAISE EXCEPTION '8c staging recovery requires three exact retained rows and no other crypto rows';
  END IF;
END $$;

INSERT INTO module_constants
  (module_name, constant_name, value, asset_class, exchange, strategy, regime, updated_at, updated_by)
VALUES
  ('level_basis', concat_ws('_', 'crypto', 'birth', 'sided', 'enabled'), '1'::jsonb,
   'crypto_spot', '*', '*', '*', '2026-11-16T09:45:01.351822Z'::timestamptz, 'kd-91-8c-switch-on-cc-c');

COMMIT;

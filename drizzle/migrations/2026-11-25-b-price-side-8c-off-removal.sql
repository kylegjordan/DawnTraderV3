-- Phase B. Live deploy requires the reviewed Phase A process and the exact four-row ON census.
-- The immutable seed inserts OFF only for fresh replay; the seed-provenance gate below admits it.
BEGIN;
SET LOCAL lock_timeout = '5s';
LOCK TABLE module_constants IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  switch_name CONSTANT text := concat_ws('_', 'crypto', 'birth', 'sided', 'enabled');
  switch_row module_constants%ROWTYPE;
  total_rows int;
  retained_rows int;
  before_retained jsonb;
  after_retained jsonb;
  deleted_rows int;
BEGIN
  SELECT count(*),
         count(*) FILTER (
           WHERE exchange = '*' AND strategy = '*' AND regime = '*'
             AND (constant_name, value) IN (
               ('level_build_max_age_ms', '60000'::jsonb),
               ('level_build_max_spread_fraction', '0.50'::jsonb),
               ('level_build_drift_ref_60s', '0.00429'::jsonb)
             )
         ),
         jsonb_agg(to_jsonb(c) ORDER BY constant_name) FILTER (WHERE constant_name <> switch_name)
    INTO total_rows, retained_rows, before_retained
    FROM module_constants AS c
   WHERE module_name = 'level_basis' AND asset_class = 'crypto_spot';

  IF total_rows <> 4 OR retained_rows <> 3 THEN
    RAISE EXCEPTION '8c Phase B precondition: expected four total and three exact retained rows; found % and %',
      total_rows, retained_rows;
  END IF;

  SELECT * INTO switch_row FROM module_constants
   WHERE module_name = 'level_basis' AND asset_class = 'crypto_spot'
     AND exchange = '*' AND strategy = '*' AND regime = '*' AND constant_name = switch_name;
  IF NOT FOUND OR switch_row.value NOT IN ('0'::jsonb, '1'::jsonb) THEN
    RAISE EXCEPTION '8c Phase B precondition: missing or invalid switch row';
  END IF;

  IF switch_row.value = '0'::jsonb AND (
    switch_row.updated_at IS NULL OR EXISTS (
      SELECT 1 FROM module_constants
       WHERE module_name = 'level_basis' AND asset_class = 'crypto_spot'
         AND (updated_by IS DISTINCT FROM 'b-price-side-8c' OR updated_at IS DISTINCT FROM switch_row.updated_at)
    )
  ) THEN
    RAISE EXCEPTION '8c Phase B precondition: OFF row lacks matching original seed provenance';
  END IF;

  DELETE FROM module_constants
   WHERE module_name = 'level_basis' AND asset_class = 'crypto_spot'
     AND exchange = '*' AND strategy = '*' AND regime = '*' AND constant_name = switch_name;
  GET DIAGNOSTICS deleted_rows = ROW_COUNT;

  SELECT jsonb_agg(to_jsonb(c) ORDER BY constant_name) INTO after_retained
    FROM module_constants AS c
   WHERE module_name = 'level_basis' AND asset_class = 'crypto_spot';
  IF deleted_rows <> 1 OR after_retained IS DISTINCT FROM before_retained THEN
    RAISE EXCEPTION '8c Phase B postcondition: expected one deletion and exactly three unchanged retained rows';
  END IF;
END $$;

COMMIT;

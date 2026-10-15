-- B-CLASS-LEG-FILL-MODE (#1170): per-class/per-leg fill policy plus durable
-- placement provenance for the strict placement < local receipt < deadline rule.
-- Nullable/no-default columns preserve honest pre-cutover NULLs; no history is backfilled.

BEGIN;

ALTER TABLE rtb_signals
  ADD COLUMN IF NOT EXISTS entry_fill_policy varchar(20),
  ALTER COLUMN chosen_entry_mode DROP DEFAULT;

ALTER TABLE active_open_positions
  ADD COLUMN IF NOT EXISTS entry_fill_policy varchar(20),
  ADD COLUMN IF NOT EXISTS maker_placed_at timestamptz,
  ADD COLUMN IF NOT EXISTS target_exit_fill_policy varchar(20);

ALTER TABLE closed_trades
  ADD COLUMN IF NOT EXISTS entry_fill_policy varchar(20),
  ADD COLUMN IF NOT EXISTS target_exit_fill_policy varchar(20);

ALTER TABLE vts_open_trades
  ADD COLUMN IF NOT EXISTS entry_fill_policy varchar(20),
  ADD COLUMN IF NOT EXISTS maker_placed_at timestamptz;

INSERT INTO module_constants
  (module_name, constant_name, value, asset_class, exchange, regime, strategy, updated_at, updated_by)
VALUES
  ('maker_taker', 'entry_fill_policy',       '"maker_only"'::jsonb,      'crypto_spot', '*', '*', '*', NOW(), 'b-class-leg-fill-mode'),
  ('maker_taker', 'target_exit_fill_policy', '"maker_only"'::jsonb,      'crypto_spot', '*', '*', '*', NOW(), 'b-class-leg-fill-mode'),
  ('maker_taker', 'entry_fill_policy',       '"maker_preferred"'::jsonb, 'xstock_spot', '*', '*', '*', NOW(), 'b-class-leg-fill-mode'),
  ('maker_taker', 'target_exit_fill_policy', '"maker_preferred"'::jsonb, 'xstock_spot', '*', '*', '*', NOW(), 'b-class-leg-fill-mode')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by;

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n
  FROM module_constants
  WHERE module_name = 'maker_taker'
    AND constant_name IN ('entry_fill_policy', 'target_exit_fill_policy')
    AND asset_class IN ('crypto_spot', 'xstock_spot')
    AND exchange = '*' AND strategy = '*' AND regime = '*'
    AND value #>> '{}' IN ('maker_only', 'maker_preferred');
  IF n <> 4 THEN
    RAISE EXCEPTION 'B-CLASS-LEG-FILL-MODE policy seed incomplete: expected exactly 4 valid rows, found %', n;
  END IF;
END $$;

COMMIT;

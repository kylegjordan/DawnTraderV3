-- B-ENTRY-GATE (#1224) increment A correction — OBJ-4 friction-coverage shadow.
--
-- The scope requires a probability-free, WATCH-ONLY comparison at every evaluated fill:
--   net reward after the arm's round-trip friction >= k * that round-trip friction.
-- `k = 1` is an observation threshold, not a live gate. The full ratio is archived so a later
-- Kyle decision can select or reject a live floor from measured fills without changing history.
-- The synchronous reader is fail-hard and the entry_gate module is already warmed at boot.

BEGIN;

INSERT INTO module_constants
  (module_name, constant_name, value, asset_class, exchange, regime, strategy, updated_at, updated_by)
VALUES
  ('entry_gate', 'entry_friction_coverage_k', '1.0'::jsonb, 'crypto_spot', '*', '*', '*', NOW(), 'b-entry-gate-friction-coverage'),
  ('entry_gate', 'entry_friction_coverage_k', '1.0'::jsonb, 'xstock_spot', '*', '*', '*', NOW(), 'b-entry-gate-friction-coverage')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM module_constants
  WHERE module_name = 'entry_gate'
    AND constant_name = 'entry_friction_coverage_k'
    AND asset_class IN ('crypto_spot', 'xstock_spot');
  IF n <> 2 THEN
    RAISE EXCEPTION 'B-ENTRY-GATE friction-coverage seed incomplete: expected 2 rows, found %', n;
  END IF;
END $$;

COMMIT;

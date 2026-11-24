-- B-DB-REGIME-ENUM-ALIGN (#1263) Step 9 — make telemetry_history match the writer contract.
--
-- The 2026-03-05 writer began inserting these seven Phase-14 context/source fields and
-- shared/schema.ts declared them, but no migration added them. Both the persistent-intelligence
-- migration and the 2026-04-22 baseline therefore created a narrower table. Paper mode kept the
-- reached writer disabled; the first forced real-writer proof exposed the gap on `source`.
--
-- All additions are nullable and backward-compatible. `source` keeps the schema declaration's
-- default for callers that do not supply it. The postcondition is deliberately exact: IF NOT EXISTS
-- must not accept a same-named column with a different type, width, precision, nullability or default.

ALTER TABLE telemetry_history
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS global_regime VARCHAR(40),
  ADD COLUMN IF NOT EXISTS pair_friction NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS global_friction NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS pair_directional_bias VARCHAR(20),
  ADD COLUMN IF NOT EXISTS global_directional_bias VARCHAR(20),
  ADD COLUMN IF NOT EXISTS decay_penalty NUMERIC(5,4);

DO $$
DECLARE
  bad_columns text;
BEGIN
  WITH expected(column_name, data_type, char_len, num_precision, num_scale, unknown_default) AS (
    VALUES
      ('source',                  'character varying', 20::integer, NULL::integer, NULL::integer, true),
      ('global_regime',           'character varying', 40::integer, NULL::integer, NULL::integer, false),
      ('pair_friction',           'numeric', NULL::integer, 5::integer, 2::integer, false),
      ('global_friction',         'numeric', NULL::integer, 5::integer, 2::integer, false),
      ('pair_directional_bias',   'character varying', 20::integer, NULL::integer, NULL::integer, false),
      ('global_directional_bias', 'character varying', 20::integer, NULL::integer, NULL::integer, false),
      ('decay_penalty',           'numeric', NULL::integer, 5::integer, 4::integer, false)
  )
  SELECT string_agg(e.column_name, ', ' ORDER BY e.column_name)
    INTO bad_columns
  FROM expected e
  LEFT JOIN information_schema.columns c
    ON c.table_schema = 'public'
   AND c.table_name = 'telemetry_history'
   AND c.column_name = e.column_name
  WHERE c.column_name IS NULL
     OR c.data_type IS DISTINCT FROM e.data_type
     OR c.character_maximum_length IS DISTINCT FROM e.char_len
     OR c.numeric_precision IS DISTINCT FROM e.num_precision
     OR c.numeric_scale IS DISTINCT FROM e.num_scale
     OR c.is_nullable IS DISTINCT FROM 'YES'
     OR (e.unknown_default AND c.column_default IS DISTINCT FROM '''unknown''::character varying')
     OR (NOT e.unknown_default AND c.column_default IS NOT NULL);

  IF bad_columns IS NOT NULL THEN
    RAISE EXCEPTION 'B-DB-REGIME-ENUM-ALIGN telemetry_history column postcondition failed: %', bad_columns;
  END IF;
END $$;

COMMENT ON COLUMN telemetry_history.source IS 'Phase 14 telemetry source tag';
COMMENT ON COLUMN telemetry_history.global_regime IS 'Phase 14 global regime context';
COMMENT ON COLUMN telemetry_history.pair_friction IS 'Phase 14 pair friction context';
COMMENT ON COLUMN telemetry_history.global_friction IS 'Phase 14 global friction context';
COMMENT ON COLUMN telemetry_history.pair_directional_bias IS 'Phase 14 pair directional-bias context';
COMMENT ON COLUMN telemetry_history.global_directional_bias IS 'Phase 14 global directional-bias context';
COMMENT ON COLUMN telemetry_history.decay_penalty IS 'Phase 14 decay-penalty context';

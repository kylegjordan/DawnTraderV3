-- B-XSTOCK-BAR-AVAILABILITY Step 9, R2: re-register the graded window after the R6b read
-- (Langston, 2026-11-06, Discord 1568370509329072132). The window opens Monday 2026-11-09T00:05Z:
-- eight complete UTC days (11-10..11-17), seven venue sessions available for the five required,
-- read at start + 9 days + 10 minutes = 2026-11-18T00:15Z.
-- The gate reads the GOVERNING value from this row and requires it to equal the code constant
-- EXPECTED_GRADED_WINDOW_START (server/scripts/b-xstock-bar-availability-capacity-gate.ts) by
-- toISOString(); both move together in this commit. Exactly one row must change, or this aborts.
DO $$
DECLARE
  n integer;
BEGIN
  UPDATE module_constants
     SET value = to_jsonb('2026-11-09T00:05:00Z'::text),
         updated_by = 'b-xstock-bar-availability-r2-rerun',
         updated_at = now()
   WHERE module_name = 'xstock_bar_availability'
     AND exchange = '*' AND asset_class = '*' AND strategy = '*' AND regime = '*'
     AND constant_name = 'graded_window_start';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'graded_window_start: expected exactly 1 row, updated %', n;
  END IF;
END
$$;

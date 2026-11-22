-- B-XSTOCK-BAR-AVAILABILITY Step 9, R2': re-register the graded window after the R2 FAIL
-- (the B75 sweep dropped 11-09/11-10 before the read; Langston r6 ruling, 2026-11-20, Discord
-- 1573143973550096385: midnight start, Monday). The window opens Monday 2026-11-30T00:00:00Z:
-- six venue sessions inside it (ET starts 11-29, 11-30, 12-01, 12-02, 12-03, 12-06) for the five
-- required, no US holiday; read by the R7 runner at start + 9 days + 10 minutes = 2026-12-09T00:10Z
-- (first cron fire 00:15Z, two hours before that day's 02:15Z sweep; R7b holds the in-window
-- partitions until a verdict exists). 2026-11-23 was rejected: Thanksgiving (11-26) and the 11-27
-- half day leave four sessions, a FAIL, and a FAIL spends the one-shot verdict key.
-- The gate reads the GOVERNING value from this row and requires it to equal the code constant
-- EXPECTED_GRADED_WINDOW_START (server/scripts/b-xstock-bar-availability-capacity-gate.ts) by
-- toISOString(); both move together in this commit. Exactly one row must change, or this aborts.
DO $$
DECLARE
  n integer;
BEGIN
  UPDATE module_constants
     SET value = to_jsonb('2026-11-30T00:00:00Z'::text),
         updated_by = 'b-xstock-bar-availability-r2prime',
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

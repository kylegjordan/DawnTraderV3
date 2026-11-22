-- B-XSTOCK-BAR-AVAILABILITY Step 9, R2': re-register the graded window after the R2 FAIL
-- (the B75 sweep dropped 11-09/11-10 before the read; Langston r6 ruling, 2026-11-20, Discord
-- 1573143973550096385). Step-4 send-back (2026-11-22) fixed the Sunday session start to the 20:15 ET
-- reopen (market-hours.ts XSTOCK_SUNDAY_REOPEN_LIVE_MIN_ET) and moved the start one hour, to Monday
-- 2026-11-30T01:00:00Z = Sunday 20:00 ET, the venue's week open. Read by the R7 runner at start + 9 days
-- + 10 minutes = 2026-12-09T01:10Z, so the first due cron fire is 2026-12-10T00:15Z, and the read then
-- holds SEVEN complete-able venue sessions (ET dates 11-29, 11-30, 12-01, 12-02, 12-03, 12-06, 12-07) for
-- the five required, no US holiday. A 00:00Z start reads at 12-09 00:15Z and loses the 12-07 session
-- (it ends 12-09 01:00Z), leaving six. Pre-registered cost: the 12-09 02:15Z sweep runs before any verdict
-- and R7b holds the 11-30 revision partition for one night (an expected sweep-hold warning that clears at
-- the next sweep), and the hold cap then covers two runner-failure nights, not three. 2026-11-23 was
-- rejected: Thanksgiving (11-26) and the 11-27 half day leave four sessions, a FAIL, and a FAIL spends the
-- one-shot verdict key.
-- The gate reads the GOVERNING value from this row and requires it to equal the code constant
-- EXPECTED_GRADED_WINDOW_START (server/scripts/b-xstock-bar-availability-capacity-gate.ts) by
-- toISOString(); both move together in this commit. Exactly one row must change, or this aborts.
DO $$
DECLARE
  n integer;
BEGIN
  UPDATE module_constants
     SET value = to_jsonb('2026-11-30T01:00:00Z'::text),
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

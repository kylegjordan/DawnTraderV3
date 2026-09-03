-- B-VENUE-QUIET-ALERTING (#526): the discriminator's actual inputs at the five live cases.
-- Langston routed four of these (6339b2d9, 1ea0a78f, b1f58a01, ab16f068); 1d1573c7 is the RIOT case.
--
-- His point 3 taken: a MINUTE BIN counts ticks arriving AFTER the instant, so it is not the state
-- at the instant. Both are reported here so the difference is visible, and the trailing window
-- ending AT the instant is the honest one.
--
-- POSITIVE CONTROL, and it can fail: `subject_mark_age_s` is computed from the tick table, while
-- `alert_says_age_s` is what the alert itself recorded at emit time from a different code path.
-- If my binning reads the wrong object, these two disagree.
WITH cases(alert, sym, t_instant, alert_says_age_s, ceiling_s) AS (VALUES
  ('1d1573c7 RIOT (fill-block)', 'RIOT/USD', timestamptz '2026-09-02 20:18:23+00',  55.5, 15.0),
  ('6339b2d9 NEM  (exit-skip)',  'NEM/USD',  timestamptz '2026-09-02 20:40:11+00', 157.0, 98.0),
  ('1ea0a78f CTVA (exit-skip)',  'CTVA/USD', timestamptz '2026-09-02 21:46:48+00', 168.0, 88.0),
  ('b1f58a01 MDT  (exit-skip)',  'MDT/USD',  timestamptz '2026-09-02 10:02:25+00', 124.0, 65.0),
  ('ab16f068 LI   (exit-skip)',  'LI/USD',   timestamptz '2026-09-03 04:25:22+00', 302.0, 243.0)
)
SELECT c.alert,
       to_char(c.t_instant AT TIME ZONE 'America/New_York', 'MM-DD HH24:MI') AS ny_time,
       -- COHORT, minute bin (comparable to the committed query; includes post-instant ticks)
       (SELECT count(DISTINCT s.symbol) FROM xstock_spot_ticker_snap s
         WHERE s.captured_at >= date_trunc('minute', c.t_instant)
           AND s.captured_at <  date_trunc('minute', c.t_instant) + interval '1 minute') AS cohort_bin,
       -- COHORT, trailing 60s ENDING AT the instant (the honest state at the instant)
       (SELECT count(DISTINCT s.symbol) FROM xstock_spot_ticker_snap s
         WHERE s.captured_at >  c.t_instant - interval '60 seconds'
           AND s.captured_at <= c.t_instant) AS cohort_trail60,
       -- COHORT, trailing 300s (a slower comparator, for threshold sensitivity)
       (SELECT count(DISTINCT s.symbol) FROM xstock_spot_ticker_snap s
         WHERE s.captured_at >  c.t_instant - interval '300 seconds'
           AND s.captured_at <= c.t_instant) AS cohort_trail300,
       -- SUBJECT: how stale was the symbol under test, computed from the tick table
       round(EXTRACT(epoch FROM (c.t_instant - (
         SELECT max(s.captured_at) FROM xstock_spot_ticker_snap s
          WHERE s.symbol = c.sym AND s.captured_at <= c.t_instant)))::numeric, 1) AS subject_mark_age_s,
       c.alert_says_age_s,
       c.ceiling_s
  FROM cases c ORDER BY c.t_instant;

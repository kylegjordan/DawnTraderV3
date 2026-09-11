-- B-XSTOCK-FEED-SANITY (#943) §6(c) — THE FALSE-HOLLOW COUNT for the 9 post-09-04 yields named in Langston's closing
-- read (2026-09-11 17:23Z). Run on staging: psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f <this file>
--
-- RULE, STATED BEFORE THE DATA. §6(c) names the count ("yields where the realized move confirmed a genuine move") but no
-- horizon or threshold, so this operationalisation is CC-C's and is for Langston to rule on:
--   the hollow reading claims a departed quote is not real. A yield is a FALSE HOLLOW when the traded price confirms the
--   departure: the median of `last` over (yield, yield + 5 min] has moved from the guard's own priorLast in the flagged
--   direction (bid_collapsed = down, ask_spiked = up, mark_deviation = the sign of midDepartureFrac) by at least the
--   guard's own departureThresholdFrac. +90 s and +30 min are published beside it; the class is pinned to +5 min.
--   No frames in the window = NOT COMPUTABLE (for example a closed venue), never "not false".
-- Inputs (time, symbol, reason, priorLast, departureThresholdFrac, midDepartureFrac sign) are copied verbatim from each
-- YIELD line in the staging error logs.
-- ⚠️ The first run failed before returning a row (round() on double precision); the rule was not changed for the rerun.
-- Positive-control column: frames for the symbol in the 5 minutes BEFORE the yield.
\pset footer off
with y(n, t, sym, reason, prior_last, thr, dir) as (values
  (1, timestamptz '2026-09-05 00:16:29+00', 'ARKK/USD', 'mark_deviation', 85.95::numeric,  0.010452961672473768::numeric,  1),
  (2, timestamptz '2026-09-05 00:16:31+00', 'LI/USD',   'bid_collapsed',  12.36,           0.029244516653127352,         -1),
  (3, timestamptz '2026-09-05 00:16:31+00', 'NEM/USD',  'bid_collapsed',  128.15,          0.015009380863039747,         -1),
  (4, timestamptz '2026-09-05 00:16:31+00', 'SLV/USD',  'bid_collapsed',  59.87,           0.01,                         -1),
  (5, timestamptz '2026-09-08 08:59:06+00', 'NEM/USD',  'ask_spiked',     126,             0.01,                          1),
  (6, timestamptz '2026-09-08 20:16:30+00', 'NEM/USD',  'ask_spiked',     127.06,          0.01,                          1),
  (7, timestamptz '2026-09-09 08:24:15+00', 'LMT/USD',  'ask_spiked',     538.3,           0.010428769275098318,          1),
  (8, timestamptz '2026-09-11 06:21:02+00', 'NEM/USD',  'bid_collapsed',  125.81,          0.01,                         -1),
  (9, timestamptz '2026-09-11 08:07:23+00', 'NEM/USD',  'bid_collapsed',  126.47,          0.013289036544850552,         -1)
), w as (
  select y.*,
    (select count(*) from xstock_spot_ticker_snap s where s.symbol = y.sym and s.captured_at > y.t - interval '5 minutes' and s.captured_at <= y.t) as frames_before_5m,
    (select count(*) from xstock_spot_ticker_snap s where s.symbol = y.sym and s.captured_at > y.t and s.captured_at <= y.t + interval '5 minutes' and s.last > 0) as n_5m,
    (select percentile_cont(0.5) within group (order by s.last) from xstock_spot_ticker_snap s where s.symbol = y.sym and s.captured_at > y.t and s.captured_at <= y.t + interval '90 seconds' and s.last > 0)::numeric as med_90s,
    (select percentile_cont(0.5) within group (order by s.last) from xstock_spot_ticker_snap s where s.symbol = y.sym and s.captured_at > y.t and s.captured_at <= y.t + interval '5 minutes' and s.last > 0)::numeric as med_5m,
    (select percentile_cont(0.5) within group (order by s.last) from xstock_spot_ticker_snap s where s.symbol = y.sym and s.captured_at > y.t and s.captured_at <= y.t + interval '30 minutes' and s.last > 0)::numeric as med_30m
  from y
)
select n, to_char(t, 'MM-DD HH24:MI:SS') as yield_utc, sym, reason, dir, round(thr * 100, 3) as thr_pct, prior_last,
       frames_before_5m, n_5m,
       round((med_90s / prior_last - 1) * 100, 3) as move_90s_pct,
       round((med_5m  / prior_last - 1) * 100, 3) as move_5m_pct,
       round((med_30m / prior_last - 1) * 100, 3) as move_30m_pct,
       case when med_5m is null then 'not computable'
            when dir * (med_5m / prior_last - 1) >= thr then 'FALSE HOLLOW'
            else 'hollow held' end as class_at_5m
  from w order by n;

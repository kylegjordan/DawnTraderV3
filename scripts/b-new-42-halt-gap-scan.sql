-- ═════════════════════════════════════════════════════════════════════════════
-- B-NEW-42 §2.3.1 — Halt / circuit-breaker tick-stream gap scan
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Scans xstock_spot_ticker_snap for extended gaps in the ticker stream during
-- RTH (9:30-16:00 ET, US equity regular trading hours). Two scan conditions:
--
--   (a) >5 min without ticker update on a 24/7-quoted name
--   (b) >5 min during RTH on a 24/5-quoted name with other names still updating
--
-- For halt-candidates found in (a) or (b), inspect surrounding rows to
-- characterize Kraken behavior as pause / stale / synthetic.
--
-- Output written via \copy to:
--   1-system-manual/audits/b-new-42/halt-gaps-scan.csv
--
-- ═════════════════════════════════════════════════════════════════════════════

SET statement_timeout = 0;

\echo === PASS A: Per-symbol inter-snap gap distribution ===

WITH gaps AS (
  SELECT
    symbol,
    captured_at,
    LAG(captured_at) OVER (PARTITION BY symbol ORDER BY captured_at) AS prev_captured_at,
    last::numeric AS last_price,
    LAG(last::numeric) OVER (PARTITION BY symbol ORDER BY captured_at) AS prev_last_price
  FROM xstock_spot_ticker_snap_2026_05
  WHERE captured_at >= NOW() - INTERVAL '7 days'
),
gap_seconds AS (
  SELECT
    symbol,
    captured_at,
    prev_captured_at,
    EXTRACT(EPOCH FROM (captured_at - prev_captured_at)) AS gap_seconds,
    last_price,
    prev_last_price,
    CASE
      WHEN prev_last_price IS NOT NULL AND prev_last_price > 0
      THEN (last_price - prev_last_price) / prev_last_price * 100
      ELSE NULL
    END AS price_change_pct
  FROM gaps
  WHERE prev_captured_at IS NOT NULL
)
SELECT
  symbol,
  prev_captured_at AS gap_start,
  captured_at AS gap_end,
  ROUND(gap_seconds::numeric) AS gap_seconds,
  ROUND(gap_seconds::numeric / 60, 1) AS gap_minutes,
  ROUND(prev_last_price, 4) AS pre_gap_last,
  ROUND(last_price, 4) AS post_gap_last,
  ROUND(price_change_pct, 4) AS price_change_pct,
  CASE
    -- If price stays nearly identical across a long gap, ticker was paused (no fresh data)
    WHEN gap_seconds > 300 AND price_change_pct IS NOT NULL AND ABS(price_change_pct) < 0.1
      THEN 'candidate_pause_no_movement'
    -- If price changed significantly across a long gap, this looks like a halt that resumed at a gapped price
    WHEN gap_seconds > 300 AND price_change_pct IS NOT NULL AND ABS(price_change_pct) >= 0.5
      THEN 'candidate_halt_with_resume_gap'
    -- Long gap with moderate price change
    WHEN gap_seconds > 300
      THEN 'candidate_extended_gap_moderate_movement'
    ELSE 'normal'
  END AS halt_classification
FROM gap_seconds
WHERE gap_seconds > 300  -- >5 min threshold per v2 plan §0.3.1
ORDER BY symbol ASC, gap_start ASC;

\echo === PASS B: RTH-window summary (only NYSE-aligned 24/5 names) ===

WITH rth_hours AS (
  -- Approximate RTH window in UTC year-round; DST aware via -4h vs -5h boundary
  -- During US EDT (Mar-Nov): 9:30-16:00 ET = 13:30-20:00 UTC
  -- During US EST (Nov-Mar): 9:30-16:00 ET = 14:30-21:00 UTC
  SELECT
    captured_at,
    EXTRACT(HOUR FROM captured_at AT TIME ZONE 'America/New_York') AS et_hour,
    EXTRACT(MINUTE FROM captured_at AT TIME ZONE 'America/New_York') AS et_minute,
    EXTRACT(DOW FROM captured_at AT TIME ZONE 'America/New_York') AS et_dow,
    symbol,
    last::numeric AS last_price
  FROM xstock_spot_ticker_snap_2026_05
  WHERE captured_at >= NOW() - INTERVAL '7 days'
)
SELECT
  symbol,
  COUNT(*) AS rth_snap_count,
  MIN(captured_at) AS earliest_rth_snap,
  MAX(captured_at) AS latest_rth_snap
FROM rth_hours
WHERE et_dow BETWEEN 1 AND 5  -- Mon-Fri only
  AND (et_hour > 9 OR (et_hour = 9 AND et_minute >= 30))  -- 9:30 ET +
  AND et_hour < 16  -- before 16:00 ET
GROUP BY symbol
ORDER BY symbol ASC;

\echo === PASS C: Gap distribution histogram per symbol ===

WITH gaps AS (
  SELECT
    symbol,
    EXTRACT(EPOCH FROM (captured_at - LAG(captured_at) OVER (PARTITION BY symbol ORDER BY captured_at))) AS gap_seconds
  FROM xstock_spot_ticker_snap_2026_05
  WHERE captured_at >= NOW() - INTERVAL '7 days'
)
SELECT
  symbol,
  COUNT(*) FILTER (WHERE gap_seconds IS NOT NULL) AS total_inter_snap_intervals,
  COUNT(*) FILTER (WHERE gap_seconds > 60) AS gaps_over_1min,
  COUNT(*) FILTER (WHERE gap_seconds > 300) AS gaps_over_5min,
  COUNT(*) FILTER (WHERE gap_seconds > 600) AS gaps_over_10min,
  COUNT(*) FILTER (WHERE gap_seconds > 1800) AS gaps_over_30min,
  ROUND(MAX(gap_seconds)::numeric) AS max_gap_seconds,
  ROUND(AVG(gap_seconds)::numeric) AS avg_gap_seconds
FROM gaps
WHERE gap_seconds IS NOT NULL
GROUP BY symbol
ORDER BY gaps_over_5min DESC, symbol ASC;

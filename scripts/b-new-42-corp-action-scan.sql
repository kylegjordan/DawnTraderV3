-- ═════════════════════════════════════════════════════════════════════════════
-- B-NEW-42 §2.1.1 — Corporate-action step-change scan
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Scans xstock_spot_ticker_snap + xstock_spot_ohlc_1m for evidence of corporate
-- action events (splits, large dividends, spin-offs) in the archived window.
--
-- Two query passes:
--   PASS A: ticker-snap prev_day_close vs open_24h ratio anomalies (>40%).
--           Targets EOD-boundary corporate-action gap-downs/ups.
--   PASS B: OHLC consecutive-minute-bar close-to-open step-changes (>40%).
--           Targets intra-bar corporate-action discontinuities.
--
-- Output written via \copy to:
--   1-system-manual/audits/b-new-42/corp-actions-scan.csv
--
-- Run on staging:
--   ssh root@188.245.193.8 'su - deploy -c "psql \$DATABASE_URL -f \
--     /home/deploy/dawntrader/scripts/b-new-42-corp-action-scan.sql"'
--
-- ═════════════════════════════════════════════════════════════════════════════

-- Disable statement timeout for these read-only diagnostic queries (default
-- pool-level statement_timeout=30s set by B-NEW-40 is too short for full
-- archive scans over 46M+ partitioned rows).
SET statement_timeout = 0;

-- Pass A: ticker-snap prev_day_close / open_24h ratio anomalies
\echo === PASS A: ticker-snap prev_day_close vs open_24h anomalies ===

WITH ticker_anomalies AS (
  SELECT
    captured_at,
    symbol,
    prev_day_close::numeric AS prev_day_close,
    open_24h::numeric AS open_24h,
    CASE
      WHEN open_24h IS NULL OR open_24h::numeric = 0 THEN NULL
      ELSE prev_day_close::numeric / open_24h::numeric
    END AS ratio,
    metadata
  FROM xstock_spot_ticker_snap
  WHERE prev_day_close IS NOT NULL
    AND open_24h IS NOT NULL
    AND open_24h::numeric > 0
)
SELECT
  symbol,
  captured_at,
  ROUND(prev_day_close, 4) AS prev_day_close,
  ROUND(open_24h, 4) AS open_24h,
  ROUND(ratio, 4) AS ratio,
  CASE
    WHEN ratio < 0.6 THEN 'candidate_forward_split_or_special_div'
    WHEN ratio > 1.6 THEN 'candidate_reverse_split'
    ELSE 'unclassified_large_step'
  END AS candidate_event_classification,
  metadata
FROM ticker_anomalies
WHERE ratio IS NOT NULL
  AND (ratio < 0.6 OR ratio > 1.6)
ORDER BY captured_at ASC, symbol ASC;

-- Pass B: OHLC consecutive-bar close-to-open step-changes
\echo === PASS B: OHLC consecutive-bar close-to-open step-changes ===

WITH bars_with_prev AS (
  SELECT
    symbol,
    interval_begin,
    open::numeric AS open,
    close::numeric AS close,
    metadata,
    LAG(close::numeric) OVER (PARTITION BY symbol ORDER BY interval_begin) AS prev_close,
    LAG(interval_begin) OVER (PARTITION BY symbol ORDER BY interval_begin) AS prev_interval_begin
  FROM xstock_spot_ohlc_1m
  WHERE interval_begin >= '2026-05-01'::timestamptz
),
step_changes AS (
  SELECT
    symbol,
    interval_begin,
    prev_interval_begin,
    EXTRACT(EPOCH FROM (interval_begin - prev_interval_begin)) AS seconds_since_prev,
    prev_close,
    open,
    CASE
      WHEN prev_close IS NULL OR prev_close = 0 THEN NULL
      ELSE open / prev_close
    END AS ratio,
    metadata
  FROM bars_with_prev
  WHERE prev_close IS NOT NULL
)
SELECT
  symbol,
  interval_begin,
  prev_interval_begin,
  seconds_since_prev,
  ROUND(prev_close, 4) AS prev_close,
  ROUND(open, 4) AS open,
  ROUND(ratio, 4) AS ratio,
  CASE
    WHEN ratio < 0.6 THEN 'candidate_forward_split_or_special_div'
    WHEN ratio > 1.6 THEN 'candidate_reverse_split'
    ELSE 'unclassified_large_step'
  END AS candidate_event_classification,
  metadata
FROM step_changes
WHERE ratio IS NOT NULL
  AND (ratio < 0.6 OR ratio > 1.6)
ORDER BY interval_begin ASC, symbol ASC;

-- Pass C: OHLC metadata jsonb keys distribution (§2.1.3)
\echo === PASS C: OHLC metadata jsonb key distribution ===

WITH metadata_keys AS (
  SELECT DISTINCT jsonb_object_keys(metadata) AS key
  FROM xstock_spot_ohlc_1m
  WHERE metadata IS NOT NULL
)
SELECT key
FROM metadata_keys
ORDER BY key;

-- Pass D: Ticker-snap metadata jsonb keys distribution
\echo === PASS D: Ticker-snap metadata jsonb key distribution ===

WITH ticker_metadata_keys AS (
  SELECT DISTINCT jsonb_object_keys(metadata) AS key
  FROM xstock_spot_ticker_snap
  WHERE metadata IS NOT NULL
)
SELECT key
FROM ticker_metadata_keys
ORDER BY key;

-- Pass E: archive window summary (uses partition-level stats — index-friendly)
\echo === PASS E: archive window summary ===

SELECT
  'xstock_spot_ticker_snap' AS table_name,
  (SELECT MIN(captured_at) FROM xstock_spot_ticker_snap_2026_05) AS earliest_may,
  (SELECT MAX(captured_at) FROM xstock_spot_ticker_snap_2026_05) AS latest_may,
  46199941 AS row_count_may_estimate,
  (SELECT COUNT(DISTINCT symbol) FROM xstock_spot_ticker_snap_2026_05) AS distinct_symbols_may
UNION ALL
SELECT
  'xstock_spot_ohlc_1m' AS table_name,
  (SELECT MIN(interval_begin) FROM xstock_spot_ohlc_1m_2026_05) AS earliest_may,
  (SELECT MAX(interval_begin) FROM xstock_spot_ohlc_1m_2026_05) AS latest_may,
  14187165 AS row_count_may_estimate,
  (SELECT COUNT(DISTINCT symbol) FROM xstock_spot_ohlc_1m_2026_05) AS distinct_symbols_may;

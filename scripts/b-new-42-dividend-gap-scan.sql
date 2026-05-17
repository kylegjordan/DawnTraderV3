-- ═════════════════════════════════════════════════════════════════════════════
-- B-NEW-42 §2.2.1 — Dividend ex-date gap-down scan
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Scans xstock_spot_ticker_snap for ex-dividend gap-down events in the top-15
-- dividend-paying name candidates (KO, JNJ, PG, XOM, CVX, JPM, BAC, T, VZ, MCD,
-- HD, WMT, MMM, IBM, MO).
--
-- Two scan windows per Langston rev2 §2.2.1:
--   PRIMARY: gap-downs in 0.3%-1.5% range (regular quarterly dividend yields).
--   WIDENED: any unexplained overnight gap >0.3% (catches special divs + spin-offs).
--
-- Categorization (computed in CSV):
--   regular_quarterly        — gap in 0.3%-1.5%
--   special_or_spinoff       — gap >1.5% on dividend-paying name
--   below_threshold          — gap <0.3% (ignored; out-of-bounds)
--
-- Output written via \copy to:
--   1-system-manual/audits/b-new-42/dividend-gaps-scan.csv
--
-- ═════════════════════════════════════════════════════════════════════════════

SET statement_timeout = 0;

\echo === Dividend-paying name presence in xstock_spot universe ===

WITH dividend_names AS (
  SELECT unnest(ARRAY[
    'KO/USD', 'JNJ/USD', 'PG/USD', 'XOM/USD', 'CVX/USD',
    'JPM/USD', 'BAC/USD', 'T/USD', 'VZ/USD', 'MCD/USD',
    'HD/USD', 'WMT/USD', 'MMM/USD', 'IBM/USD', 'MO/USD'
  ]) AS candidate_symbol
)
SELECT
  dn.candidate_symbol,
  EXISTS (
    SELECT 1 FROM xstock_spot_ticker_snap ts WHERE ts.symbol = dn.candidate_symbol LIMIT 1
  ) AS present_in_archive,
  COALESCE(
    (SELECT COUNT(*) FROM xstock_spot_ticker_snap ts WHERE ts.symbol = dn.candidate_symbol),
    0
  ) AS row_count_in_archive
FROM dividend_names dn
ORDER BY dn.candidate_symbol;

\echo === PASS A: Gap analysis (prev_day_close vs open_24h for dividend-paying names) ===

WITH dividend_universe AS (
  SELECT unnest(ARRAY[
    'KO/USD', 'JNJ/USD', 'PG/USD', 'XOM/USD', 'CVX/USD',
    'JPM/USD', 'BAC/USD', 'T/USD', 'VZ/USD', 'MCD/USD',
    'HD/USD', 'WMT/USD', 'MMM/USD', 'IBM/USD', 'MO/USD'
  ]) AS symbol
),
ticker_gaps AS (
  SELECT
    ts.captured_at,
    ts.symbol,
    ts.prev_day_close::numeric AS prev_day_close,
    ts.open_24h::numeric AS open_24h,
    CASE
      WHEN ts.open_24h IS NULL OR ts.open_24h::numeric = 0 THEN NULL
      ELSE (ts.prev_day_close::numeric - ts.open_24h::numeric) / ts.open_24h::numeric * 100
    END AS gap_pct  -- positive means open is BELOW prev close = gap-down behavior
  FROM xstock_spot_ticker_snap ts
  INNER JOIN dividend_universe du ON ts.symbol = du.symbol
  WHERE ts.prev_day_close IS NOT NULL
    AND ts.open_24h IS NOT NULL
    AND ts.open_24h::numeric > 0
)
SELECT
  symbol,
  captured_at,
  ROUND(prev_day_close, 4) AS prev_day_close,
  ROUND(open_24h, 4) AS open_24h,
  ROUND(gap_pct, 4) AS gap_pct,
  CASE
    WHEN gap_pct BETWEEN 0.3 AND 1.5 THEN 'regular_quarterly'
    WHEN gap_pct > 1.5 THEN 'special_or_spinoff'
    WHEN gap_pct BETWEEN -1.5 AND -0.3 THEN 'reverse_gap_up'
    WHEN gap_pct < -1.5 THEN 'special_gap_up'
    ELSE 'below_threshold'
  END AS category
FROM ticker_gaps
WHERE gap_pct IS NOT NULL
  AND ABS(gap_pct) >= 0.3  -- widened scan threshold (Langston rev2 §2.2.1)
ORDER BY symbol ASC, captured_at ASC;

\echo === PASS B: Daily snapshot aggregation (one row per symbol per day) ===

WITH dividend_universe AS (
  SELECT unnest(ARRAY[
    'KO/USD', 'JNJ/USD', 'PG/USD', 'XOM/USD', 'CVX/USD',
    'JPM/USD', 'BAC/USD', 'T/USD', 'VZ/USD', 'MCD/USD',
    'HD/USD', 'WMT/USD', 'MMM/USD', 'IBM/USD', 'MO/USD'
  ]) AS symbol
),
daily_first_snap AS (
  SELECT DISTINCT ON (symbol, DATE(captured_at AT TIME ZONE 'UTC'))
    symbol,
    DATE(captured_at AT TIME ZONE 'UTC') AS snap_date,
    captured_at,
    prev_day_close::numeric AS prev_day_close,
    open_24h::numeric AS open_24h
  FROM xstock_spot_ticker_snap
  WHERE symbol IN (SELECT symbol FROM dividend_universe)
    AND prev_day_close IS NOT NULL
    AND open_24h IS NOT NULL
    AND open_24h::numeric > 0
  ORDER BY symbol, DATE(captured_at AT TIME ZONE 'UTC'), captured_at ASC
)
SELECT
  symbol,
  snap_date,
  ROUND(prev_day_close, 4) AS prev_day_close,
  ROUND(open_24h, 4) AS open_24h,
  ROUND((prev_day_close - open_24h) / open_24h * 100, 4) AS daily_gap_pct
FROM daily_first_snap
ORDER BY symbol ASC, snap_date ASC;

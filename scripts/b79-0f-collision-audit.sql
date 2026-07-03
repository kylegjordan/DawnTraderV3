-- B79.0f — Asset-class collision audit (READ-ONLY by default).
--
-- Purpose: identify any historical rows where a collision-ticker symbol
-- (BDX, CVX, DASH, EDU, MET, OPEN, PEP, SUI, T) was tagged asset_class='xstock_spot'
-- when it should have been 'crypto_spot' (the resolver bug pre-B79.0f).
--
-- IDEMPOTENT: SELECT-only. UPDATE remediation statements at the bottom are
-- COMMENTED OUT. After Kyle reviews the audit output, uncomment per-table
-- remediation as appropriate. Backfill governance (Langston rev 2 #5):
-- record per-table row counts touched in CHANGES_AND_FIXES.md for paper trail.
--
-- Run:
--   psql "$DATABASE_URL" -f scripts/b79-0f-collision-audit.sql
--
-- Provenance: 2026-05-10 collision set from Kraken /0/public/AssetPairs query.

\echo '=== B79.0f Collision Audit (read-only) ==='
\echo ''

-- Tables with asset_class column that could carry mis-tagged collision rows.
-- Identified via:
--   SELECT table_name FROM information_schema.columns
--   WHERE column_name='asset_class' GROUP BY table_name;
-- Audit query is read-only — no row writes.

\echo '--- 1. signal_eval_archive (parent + monthly partitions) ---'
SELECT
  asset_class,
  symbol,
  COUNT(*) AS row_count,
  MIN(captured_at) AS first_seen,
  MAX(captured_at) AS last_seen
FROM signal_eval_archive
WHERE symbol IN (
  'BDX/USD','CVX/USD','DASH/USD','EDU/USD','MET/USD','OPEN/USD','PEP/USD','SUI/USD','T/USD',
  'BDX/EUR','CVX/EUR','DASH/EUR','EDU/EUR','MET/EUR','OPEN/EUR','PEP/EUR','SUI/EUR','T/EUR'
)
GROUP BY asset_class, symbol
ORDER BY symbol, asset_class;

\echo ''
\echo '--- 2. trading_signals ---'
SELECT
  asset_class,
  symbol,
  COUNT(*) AS row_count
FROM trading_signals
WHERE symbol IN (
  'BDX/USD','CVX/USD','DASH/USD','EDU/USD','MET/USD','OPEN/USD','PEP/USD','SUI/USD','T/USD',
  'BDX/EUR','CVX/EUR','DASH/EUR','EDU/EUR','MET/EUR','OPEN/EUR','PEP/EUR','SUI/EUR','T/EUR'
)
GROUP BY asset_class, symbol
ORDER BY symbol, asset_class;

\echo ''
\echo '--- 3. regime_factor_alternates ---'
SELECT
  asset_class,
  COUNT(*) AS row_count,
  MIN(evaluated_at) AS first_seen,
  MAX(evaluated_at) AS last_seen
FROM regime_factor_alternates
WHERE asset_class = 'xstock_spot'
  AND EXISTS (
    SELECT 1 FROM unnest(ARRAY[
      'BDX/USD','CVX/USD','DASH/USD','EDU/USD','MET/USD','OPEN/USD','PEP/USD','SUI/USD','T/USD'
    ]) sym
  )
GROUP BY asset_class;

\echo ''
\echo '--- 4. exit_strategy_alternates (B73 ablation) — keyed by trade_id, not symbol ---'
-- Suspicious rows: xstock_spot tag with strategy=strong_bull_trend (xstock whitelist
-- excludes strong_bull_trend per B79 — any such row is from a mis-tagged crypto trade).
SELECT
  asset_class,
  strategy,
  COUNT(*) AS row_count,
  MIN(created_at) AS first_seen,
  MAX(created_at) AS last_seen
FROM exit_strategy_alternates
WHERE asset_class = 'xstock_spot'
  AND strategy = 'strong_bull_trend'
GROUP BY asset_class, strategy;

\echo ''
\echo '--- 5. closed_trades (paper_trades + trades have no asset_class column — pre-B69 schema) ---'
SELECT 'closed_trades' AS tbl, asset_class, symbol, COUNT(*) AS row_count
FROM closed_trades
WHERE symbol IN (
  'BDX/USD','CVX/USD','DASH/USD','EDU/USD','MET/USD','OPEN/USD','PEP/USD','SUI/USD','T/USD',
  'BDX/EUR','CVX/EUR','DASH/EUR','EDU/EUR','MET/EUR','OPEN/EUR','PEP/EUR','SUI/EUR','T/EUR'
)
GROUP BY asset_class, symbol
ORDER BY tbl, symbol;

\echo ''
\echo '=== Audit complete. Review counts above. ==='
\echo 'If any row shows asset_class=xstock_spot for a collision symbol on the regular kraken path,'
\echo 'uncomment + run the remediation block below (per-table). Record row counts in CHANGES_AND_FIXES.md.'
\echo ''

-- ─────────────────────────────────────────────────────────────────────────
-- REMEDIATION (commented out by default — uncomment per-table after review)
-- ─────────────────────────────────────────────────────────────────────────
--
-- BEGIN;
--
-- -- signal_eval_archive (live + partitions inherit)
-- UPDATE signal_eval_archive SET asset_class = 'crypto_spot'
-- WHERE asset_class = 'xstock_spot'
--   AND symbol IN ('BDX/USD','CVX/USD','DASH/USD','EDU/USD','MET/USD','OPEN/USD','PEP/USD','SUI/USD','T/USD',
--                  'BDX/EUR','CVX/EUR','DASH/EUR','EDU/EUR','MET/EUR','OPEN/EUR','PEP/EUR','SUI/EUR','T/EUR');
--
-- -- trading_signals
-- UPDATE trading_signals SET asset_class = 'crypto_spot'
-- WHERE asset_class = 'xstock_spot'
--   AND symbol IN ('BDX/USD','CVX/USD','DASH/USD','EDU/USD','MET/USD','OPEN/USD','PEP/USD','SUI/USD','T/USD',
--                  'BDX/EUR','CVX/EUR','DASH/EUR','EDU/EUR','MET/EUR','OPEN/EUR','PEP/EUR','SUI/EUR','T/EUR');
--
-- -- exit_strategy_alternates (B73)
-- UPDATE exit_strategy_alternates SET asset_class = 'crypto_spot'
-- WHERE asset_class = 'xstock_spot'
--   AND symbol IN ('BDX/USD','CVX/USD','DASH/USD','EDU/USD','MET/USD','OPEN/USD','PEP/USD','SUI/USD','T/USD',
--                  'BDX/EUR','CVX/EUR','DASH/EUR','EDU/EUR','MET/EUR','OPEN/EUR','PEP/EUR','SUI/EUR','T/EUR');
--
-- -- closed_trades / paper_trades / trades
-- -- (similar pattern; only run if audit shows non-zero counts)
--
-- COMMIT;

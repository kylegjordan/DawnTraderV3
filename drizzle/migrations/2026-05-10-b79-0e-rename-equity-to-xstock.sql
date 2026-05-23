-- db-migrate:skip
-- B-NEW-43 Phase 2 chunk 4.7 (2026-05-23): bulk skip-marker added. This
-- migration's effects are already captured in 2026-04-22-initial-schema.sql
-- (pg_dump of staging state on 2026-05-23). On a fresh empty Postgres,
-- initial-schema applies the FINAL state; re-running this delta would
-- duplicate-create or otherwise conflict (idempotent ALTER-IF-NOT-EXISTS
-- migrations would no-op but still run unnecessarily; non-idempotent ones
-- would error). Skip-marker ledger-records as applied without running the
-- SQL. See scripts/db-migrate.ts SKIP_MARKER + 1-system-manual/staging-
-- coordination/2026-04-22-initial-schema-mark-applied.sql for the full
-- staging-vs-CI bootstrap divergence model.
-- B79.0e — Rename equity_*→xstock_* archive tables + indexes + partitions.
--
-- B69 retagged asset_class field VALUES from equity_spot→xstock_spot but the
-- DB TABLES kept legacy equity_* names. This violates B69's namespace
-- convention which preserves equity_* for FUTURE real (non-tokenized) US
-- equity feeds.
--
-- ALTER TABLE RENAME is metadata-only — no data copy on 1.2M+ rows.
-- Sub-second AccessExclusiveLock; live archiver buffers absorb the gap.
--
-- Includes:
--   - 4 parent table renames
--   - All partition children (52 on staging at apply time)
--   - All indexes on parents + partitions (~112 on staging at apply time)
--   - module_constants retention key renames

BEGIN;

-- 1. Parent tables
ALTER TABLE equity_spot_ohlc_1m       RENAME TO xstock_spot_ohlc_1m;
ALTER TABLE equity_spot_ticker_snap   RENAME TO xstock_spot_ticker_snap;
ALTER TABLE equity_perp_ohlc_1m       RENAME TO xstock_perp_ohlc_1m;
ALTER TABLE equity_perp_ticker_snap   RENAME TO xstock_perp_ticker_snap;

-- 2. Parent-level indexes (partition children inherit no indexes by name in PG —
-- each partition has its own index whose name we sweep below).
ALTER INDEX equity_spot_ohlc_1m_sym_time     RENAME TO xstock_spot_ohlc_1m_sym_time;
ALTER INDEX equity_spot_ticker_snap_sym_time RENAME TO xstock_spot_ticker_snap_sym_time;
ALTER INDEX equity_perp_ohlc_1m_sym_time     RENAME TO xstock_perp_ohlc_1m_sym_time;
ALTER INDEX equity_perp_ticker_snap_sym_time RENAME TO xstock_perp_ticker_snap_sym_time;

-- 3. Partition children (auto-discover and rename anything still named equity_*).
DO $$
DECLARE
  r RECORD;
  new_name TEXT;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE tablename LIKE 'equity\_%' ESCAPE '\' LOOP
    new_name := REPLACE(r.tablename, 'equity_', 'xstock_');
    EXECUTE format('ALTER TABLE %I RENAME TO %I', r.tablename, new_name);
  END LOOP;
END
$$;

-- 4. All indexes (parents + partitions).
DO $$
DECLARE
  r RECORD;
  new_name TEXT;
BEGIN
  FOR r IN SELECT indexname FROM pg_indexes WHERE indexname LIKE 'equity\_%' ESCAPE '\' LOOP
    new_name := REPLACE(r.indexname, 'equity_', 'xstock_');
    EXECUTE format('ALTER INDEX %I RENAME TO %I', r.indexname, new_name);
  END LOOP;
END
$$;

-- 5. module_constants retention keys (data_lifecycle module).
UPDATE module_constants
SET constant_name = REPLACE(constant_name, 'equity_', 'xstock_'),
    updated_at = NOW(),
    updated_by = 'b79.0e-rename'
WHERE module_name = 'data_lifecycle'
  AND constant_name LIKE 'equity\_%' ESCAPE '\';

COMMIT;

-- Verification:
-- SELECT COUNT(*) FROM pg_tables WHERE tablename LIKE 'equity_%';   -- expect 0
-- SELECT COUNT(*) FROM pg_indexes WHERE indexname LIKE 'equity_%';  -- expect 0
-- SELECT constant_name FROM module_constants WHERE module_name='data_lifecycle' AND constant_name LIKE 'equity%';  -- expect 0

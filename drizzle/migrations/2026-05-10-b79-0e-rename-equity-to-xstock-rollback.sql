-- B79.0e rollback — reverse-rename xstock_*→equity_* across:
--   - 4 parent tables
--   - 4 parent indexes
--   - all partition children (sweep DO block)
--   - all partition indexes (sweep DO block)
--   - module_constants data_lifecycle.xstock_*.hot_retention_days keys
--
-- Symmetric to forward (Langston B79.0e Step 4 F1 fix). DESTRUCTIVE: only run
-- if vts-runner / archiver / consumer code has been reverted to use
-- equity_* names; otherwise reverted DB + post-fix code = mismatch.

BEGIN;

-- 1. Parent tables
ALTER TABLE xstock_spot_ohlc_1m       RENAME TO equity_spot_ohlc_1m;
ALTER TABLE xstock_spot_ticker_snap   RENAME TO equity_spot_ticker_snap;
ALTER TABLE xstock_perp_ohlc_1m       RENAME TO equity_perp_ohlc_1m;
ALTER TABLE xstock_perp_ticker_snap   RENAME TO equity_perp_ticker_snap;

-- 2. Parent-level indexes
ALTER INDEX xstock_spot_ohlc_1m_sym_time     RENAME TO equity_spot_ohlc_1m_sym_time;
ALTER INDEX xstock_spot_ticker_snap_sym_time RENAME TO equity_spot_ticker_snap_sym_time;
ALTER INDEX xstock_perp_ohlc_1m_sym_time     RENAME TO equity_perp_ohlc_1m_sym_time;
ALTER INDEX xstock_perp_ticker_snap_sym_time RENAME TO equity_perp_ticker_snap_sym_time;

-- 3. Partition children
DO $$
DECLARE
  r RECORD;
  new_name TEXT;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE tablename LIKE 'xstock\_%' ESCAPE '\' LOOP
    new_name := REPLACE(r.tablename, 'xstock_', 'equity_');
    EXECUTE format('ALTER TABLE %I RENAME TO %I', r.tablename, new_name);
  END LOOP;
END
$$;

-- 4. All indexes
DO $$
DECLARE
  r RECORD;
  new_name TEXT;
BEGIN
  FOR r IN SELECT indexname FROM pg_indexes WHERE indexname LIKE 'xstock\_%' ESCAPE '\' LOOP
    new_name := REPLACE(r.indexname, 'xstock_', 'equity_');
    EXECUTE format('ALTER INDEX %I RENAME TO %I', r.indexname, new_name);
  END LOOP;
END
$$;

-- 5. module_constants retention keys
UPDATE module_constants
SET constant_name = REPLACE(constant_name, 'xstock_', 'equity_'),
    updated_at = NOW(),
    updated_by = 'b79.0e-rollback'
WHERE module_name = 'data_lifecycle'
  AND constant_name LIKE 'xstock\_%' ESCAPE '\';

COMMIT;

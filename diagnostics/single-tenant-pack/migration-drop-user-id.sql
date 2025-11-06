-- Phase 2C: Single-Tenant Consolidation Migration
-- DROP user_id columns from operational tables
-- Generated: 2025-11-06 07:30 UTC
-- DESTRUCTIVE: This migration cannot be rolled back

-- ============================================================
-- STEP 1: Drop all foreign key constraints
-- ============================================================

ALTER TABLE portfolio_state 
DROP CONSTRAINT IF EXISTS portfolio_state_user_id_users_id_fk;

ALTER TABLE strategy_settings 
DROP CONSTRAINT IF EXISTS strategy_settings_user_id_users_id_fk;

ALTER TABLE trading_settings_legacy 
DROP CONSTRAINT IF EXISTS trading_settings_user_id_users_id_fk;

ALTER TABLE paper_sim_sessions 
DROP CONSTRAINT IF EXISTS paper_sim_sessions_user_id_fkey;

ALTER TABLE system_context 
DROP CONSTRAINT IF EXISTS system_context_user_id_fkey;

-- ============================================================
-- STEP 2: Drop all unique constraints
-- ============================================================

ALTER TABLE trading_settings_legacy 
DROP CONSTRAINT IF EXISTS trading_settings_user_unique;

ALTER TABLE system_context 
DROP CONSTRAINT IF EXISTS system_context_user_id_key;

-- ============================================================
-- STEP 3: Drop all indexes on user_id
-- ============================================================

DROP INDEX IF EXISTS idx_portfolio_state_user_mode;
DROP INDEX IF EXISTS paper_sim_sessions_user_idx;
DROP INDEX IF EXISTS system_context_user_id_key;
DROP INDEX IF EXISTS system_context_user_id_idx;
DROP INDEX IF EXISTS trading_settings_user_id_idx;
DROP INDEX IF EXISTS trading_settings_user_unique;

-- ============================================================
-- STEP 4: Drop user_id columns (DESTRUCTIVE)
-- ============================================================

ALTER TABLE portfolio_state DROP COLUMN IF EXISTS user_id;
ALTER TABLE strategy_settings DROP COLUMN IF EXISTS user_id;
ALTER TABLE trading_settings_legacy DROP COLUMN IF EXISTS user_id;
ALTER TABLE paper_sim_sessions DROP COLUMN IF EXISTS user_id;
ALTER TABLE system_context DROP COLUMN IF EXISTS user_id;

-- ============================================================
-- STEP 5: Create new indexes on mode columns
-- ============================================================

-- portfolio_state: mode-based index
CREATE INDEX IF NOT EXISTS idx_portfolio_state_mode 
ON portfolio_state(mode);

-- strategy_settings: check if mode column exists first
-- (will be added in schema update if needed)

-- trading_settings_legacy: check if mode column exists first

-- paper_sim_sessions: timestamp-based index for session history
CREATE INDEX IF NOT EXISTS idx_paper_sim_sessions_start_time 
ON paper_sim_sessions(start_time DESC);

-- system_context: timestamp-based index
CREATE INDEX IF NOT EXISTS idx_system_context_updated_at 
ON system_context(updated_at DESC);

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================

-- Verify user_id columns are dropped
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
    AND table_name IN ('portfolio_state', 'strategy_settings', 'trading_settings_legacy', 'paper_sim_sessions', 'system_context')
    AND column_name = 'user_id';
-- Expected: 0 rows

-- Verify portfolio_state has 2 rows (1 per mode)
SELECT mode, COUNT(*) as row_count
FROM portfolio_state
GROUP BY mode;
-- Expected: 2 rows (live=1, paper=1)

-- ============================================================
-- ROLLBACK INSTRUCTIONS
-- ============================================================
-- There is no safe rollback for this migration.
-- Restore from backup: backups/neon_backup_20251106_073341.sql
-- Command: pg_restore -d $DATABASE_URL backups/neon_backup_20251106_073341.sql

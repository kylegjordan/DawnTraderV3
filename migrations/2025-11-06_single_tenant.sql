-- Single-tenant cutover (record of live changes)
-- Phase 2C: Emergency conversion from multi-user to single-tenant
-- Date: 2025-11-06 07:30-07:54 UTC
-- Status: DESTRUCTIVE (irreversible)
-- Drops user_id from operational tables; keeps mode isolation.

-- Drop user_id columns from operational tables
ALTER TABLE IF EXISTS portfolio_state DROP COLUMN IF EXISTS user_id;
ALTER TABLE IF EXISTS strategy_settings DROP COLUMN IF EXISTS user_id;
ALTER TABLE IF EXISTS paper_sim_sessions DROP COLUMN IF EXISTS user_id;
ALTER TABLE IF EXISTS system_context DROP COLUMN IF EXISTS user_id;
ALTER TABLE IF EXISTS trading_settings_legacy DROP COLUMN IF EXISTS user_id;

-- Drop legacy constraints (if they still exist)
ALTER TABLE IF EXISTS portfolio_state DROP CONSTRAINT IF EXISTS portfolio_state_user_id_users_id_fk;
ALTER TABLE IF EXISTS strategy_settings DROP CONSTRAINT IF EXISTS strategy_settings_user_id_users_id_fk;
ALTER TABLE IF EXISTS paper_sim_sessions DROP CONSTRAINT IF EXISTS paper_sim_sessions_user_id_fkey;
ALTER TABLE IF EXISTS system_context DROP CONSTRAINT IF EXISTS system_context_user_id_fkey;
ALTER TABLE IF EXISTS trading_settings_legacy DROP CONSTRAINT IF EXISTS trading_settings_user_id_users_id_fk;
ALTER TABLE IF EXISTS trading_settings_legacy DROP CONSTRAINT IF EXISTS trading_settings_user_unique;
ALTER TABLE IF EXISTS system_context DROP CONSTRAINT IF EXISTS system_context_user_id_key;

-- Drop old indexes
DROP INDEX IF EXISTS idx_portfolio_state_user_mode;
DROP INDEX IF EXISTS paper_sim_sessions_user_idx;
DROP INDEX IF EXISTS system_context_user_id_key;
DROP INDEX IF EXISTS system_context_user_id_idx;
DROP INDEX IF EXISTS trading_settings_user_id_idx;
DROP INDEX IF EXISTS trading_settings_user_unique;

-- Mode-only constraints / indexes (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS idx_portfolio_state_mode ON portfolio_state(mode);
CREATE INDEX IF NOT EXISTS idx_paper_sim_sessions_started_at ON paper_sim_sessions(started_at DESC);

-- Note: This migration is a record of changes already applied to the live database.
-- It exists to document the schema transformation and maintain reproducibility.

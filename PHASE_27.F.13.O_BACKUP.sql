-- =====================================================================
-- Phase 27.F.13.O - Pre-Migration Database Backup
-- Date: 2025-10-23 20:00 UTC
-- Purpose: Full backup before global engine unification
-- Tables: system_context, paper_sim_sessions, watchlist_pairs, portfolio_state
-- =====================================================================

-- BACKUP METADATA
-- Created: 2025-10-23 20:00 UTC
-- System: Dawn Trader - Crypto Trading Platform
-- Migration: Phase 27.F.13.O (Per-User → Global Per-Mode)
-- Replit Agent: Automated backup before destructive schema changes

-- =====================================================================
-- TABLE 1: system_context (Current: 4 rows per-user → Target: 2 rows per-mode)
-- =====================================================================

-- Drop and recreate backup table
DROP TABLE IF EXISTS system_context_backup_20251023;
CREATE TABLE system_context_backup_20251023 (LIKE system_context INCLUDING ALL);

-- Backup all data
INSERT INTO system_context_backup_20251023 
SELECT * FROM system_context;

-- Verification query (should show 4 rows)
-- SELECT COUNT(*) as backup_row_count FROM system_context_backup_20251023;


-- =====================================================================
-- TABLE 2: paper_sim_sessions (32 rows to archive)
-- =====================================================================

DROP TABLE IF EXISTS paper_sim_sessions_backup_20251023;
CREATE TABLE paper_sim_sessions_backup_20251023 (LIKE paper_sim_sessions INCLUDING ALL);
INSERT INTO paper_sim_sessions_backup_20251023 SELECT * FROM paper_sim_sessions;

-- =====================================================================
-- TABLE 3: watchlist_pairs (1249 rows to archive)
-- =====================================================================

DROP TABLE IF EXISTS watchlist_pairs_backup_20251023;
CREATE TABLE watchlist_pairs_backup_20251023 (LIKE watchlist_pairs INCLUDING ALL);
INSERT INTO watchlist_pairs_backup_20251023 SELECT * FROM watchlist_pairs;

-- =====================================================================
-- TABLE 4: portfolio_state (2 rows - global state to preserve)
-- =====================================================================

DROP TABLE IF EXISTS portfolio_state_backup_20251023;
CREATE TABLE portfolio_state_backup_20251023 (LIKE portfolio_state INCLUDING ALL);
INSERT INTO portfolio_state_backup_20251023 SELECT * FROM portfolio_state;

-- =====================================================================
-- ROLLBACK PROCEDURE (if needed)
-- =====================================================================
-- To restore from backup:
--
-- 1. system_context:
--    TRUNCATE TABLE system_context;
--    INSERT INTO system_context SELECT * FROM system_context_backup_20251023;
--
-- 2. paper_sim_sessions:
--    TRUNCATE TABLE paper_sim_sessions;
--    INSERT INTO paper_sim_sessions SELECT * FROM paper_sim_sessions_backup_20251023;
--
-- 3. watchlist_pairs:
--    TRUNCATE TABLE watchlist_pairs;
--    INSERT INTO watchlist_pairs SELECT * FROM watchlist_pairs_backup_20251023;
--
-- 4. portfolio_state:
--    TRUNCATE TABLE portfolio_state;
--    INSERT INTO portfolio_state SELECT * FROM portfolio_state_backup_20251023;
--
-- =====================================================================
-- VERIFICATION QUERIES
-- =====================================================================

-- Run these after restore to verify integrity:
/*
SELECT 'system_context' as table_name, COUNT(*) FROM system_context
UNION ALL
SELECT 'paper_sim_sessions', COUNT(*) FROM paper_sim_sessions
UNION ALL  
SELECT 'watchlist_pairs', COUNT(*) FROM watchlist_pairs
UNION ALL
SELECT 'portfolio_state', COUNT(*) FROM portfolio_state;
*/

-- END OF BACKUP FILE
-- =====================================================================

-- Phase 2C: Single-Tenant Schema Verification
-- Date: 2025-11-06 07:52 UTC

-- Verify user_id columns removed from operational tables
SELECT 
    table_name,
    column_name
FROM information_schema.columns
WHERE table_schema = 'public'
    AND table_name IN ('portfolio_state', 'strategy_settings', 'paper_sim_sessions', 'system_context', 'trading_settings_legacy')
    AND column_name = 'user_id';
-- Expected: 0 rows (all user_id columns dropped)

-- Verify portfolio_state global context
SELECT 
    mode,
    balance,
    global_context_id,
    last_update
FROM portfolio_state
ORDER BY mode;
-- Expected: 2 rows (live=$834.11, paper=$5000.00), both with global_context_id='default'

-- Verify strategy_settings mode distribution
SELECT 
    mode,
    COUNT(*) as strategy_count
FROM strategy_settings
GROUP BY mode;
-- Expected: ~8 strategies per mode

-- Verify paper_sim_sessions count
SELECT COUNT(*) as total_sessions FROM paper_sim_sessions;
-- Expected: 131 sessions

-- Verify system_context modes
SELECT 
    trading_mode,
    is_engine_active,
    trading_pace,
    updated_at
FROM system_context
ORDER BY trading_mode;
-- Expected: 2 rows (live, paper)

-- Verify users table unchanged (auth still required)
SELECT 
    username,
    created_at
FROM users
ORDER BY created_at;
-- Expected: 5 users (kylegjordan, testuser123, testuser, test-user-guardrails, test-user)

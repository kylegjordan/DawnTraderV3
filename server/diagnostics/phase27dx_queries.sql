-- Phase 27.DX Diagnostic Queries
-- Run these queries during diagnostic testing to identify issues

-- ========================================
-- A. Current Goals State (Paper Mode)
-- ========================================
SELECT 
  metric_name,
  goal_value AS goal,
  actual_value AS actual,
  percent_achieved,
  last_updated
FROM goals_paper
WHERE user_id IN (SELECT id FROM users WHERE username='kylegjordan')
ORDER BY metric_name;

-- ========================================
-- B. Goals Audit Log (Recent Changes)
-- ========================================
SELECT 
  metric_name,
  action,
  previous_value,
  new_value,
  source,
  timestamp
FROM goal_audit_log
WHERE user_id IN (SELECT id FROM users WHERE username='kylegjordan')
ORDER BY timestamp DESC 
LIMIT 20;

-- ========================================
-- C. System Context (Trading State)
-- ========================================
SELECT 
  user_id,
  trading_mode,
  is_engine_active,
  session_id,
  last_mode_change,
  changed_by,
  change_reason,
  last_safe_state,
  updated_at
FROM system_context
WHERE user_id IN (SELECT id FROM users WHERE username='kylegjordan');

-- ========================================
-- D. Active Paper Sim Sessions
-- ========================================
SELECT 
  id,
  user_id,
  active,
  started_at,
  stopped_at,
  session_metrics
FROM active_engine_sessions
WHERE active=true;

-- ========================================
-- E. Ghost Sessions (active without context link)
-- ========================================
SELECT 
  id,
  user_id,
  active,
  started_at,
  stopped_at
FROM active_engine_sessions s
WHERE active=true
  AND NOT EXISTS (
    SELECT 1 
    FROM system_context c 
    WHERE c.session_id=s.id
  );

-- ========================================
-- F. Broken References (context pointing to missing session)
-- ========================================
SELECT 
  user_id,
  session_id,
  trading_mode,
  is_engine_active
FROM system_context c
WHERE session_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 
    FROM active_engine_sessions s 
    WHERE s.id=c.session_id
  );

-- ========================================
-- G. Active Session Counts
-- ========================================
SELECT 'Paper Sessions' AS type, COUNT(*) AS count
FROM active_engine_sessions 
WHERE active=true
UNION ALL
SELECT 'System Context Records' AS type, COUNT(*) AS count
FROM system_context;

-- ========================================
-- H. User Trading Permissions
-- ========================================
SELECT 
  username,
  role,
  is_admin
FROM users
WHERE username='kylegjordan';

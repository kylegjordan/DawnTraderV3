-- ==========================================
-- Transitional Analytics View
-- guardrails_v1 (legacy) → guardrails_v2 (new)
-- ==========================================
--
-- PURPOSE: Provide analytics continuity during Phase 2 migration
-- Allows comparison of new Core Four values with legacy guardrails
--
-- USAGE: Read-only view for reports, dashboards, analytics
-- DO NOT use this view for operational queries (use guardrails_v2 directly)
--
-- ==========================================

CREATE OR REPLACE VIEW v_guardrails_transitional AS
SELECT
  -- Core Four (new schema) from guardrails_v2
  g.mode,
  g.portfolio_risk_per_trade_pct AS risk_pct,
  g.daily_loss_kill_switch_pct AS kill_switch_pct,
  g.symbol_cooldown_minutes AS cooldown,
  g.max_open_positions AS positions,
  g.is_manual_override,
  g.tuned_by_latti,
  g.last_updated,
  
  -- Legacy fields for comparison (from guardrails table)
  legacy.max_daily_loss,
  legacy.max_drawdown,
  legacy.max_position_size,
  legacy.risk_per_trade AS legacy_risk_pct,
  legacy.cooldown_minutes AS legacy_cooldown,
  legacy.max_open_positions AS legacy_positions,
  legacy.ai_can_adjust AS legacy_ai_adjust,
  
  -- Derived comparison fields
  
  -- Check if risk values are equivalent (legacy vs new)
  CASE 
    WHEN ABS(g.portfolio_risk_per_trade_pct - COALESCE(legacy.risk_per_trade, 0)) < 0.01
    THEN true 
    ELSE false 
  END AS risk_values_match,
  
  -- Check if cooldown values match
  CASE 
    WHEN g.symbol_cooldown_minutes = COALESCE(legacy.cooldown_minutes, 0)
    THEN true 
    ELSE false 
  END AS cooldown_values_match,
  
  -- Check if position limits match
  CASE 
    WHEN g.max_open_positions = COALESCE(legacy.max_open_positions, 0)
    THEN true 
    ELSE false 
  END AS positions_match,
  
  -- Coherency check: Risk <= KillSwitch/10
  CASE 
    WHEN g.portfolio_risk_per_trade_pct <= g.daily_loss_kill_switch_pct / 10
    THEN 'PASS' 
    ELSE 'FAIL' 
  END AS coherency_rule_001,
  
  -- Coherency check: Total Exposure <= 100%
  CASE 
    WHEN g.max_open_positions * g.portfolio_risk_per_trade_pct <= 100
    THEN 'PASS' 
    ELSE 'WARN' 
  END AS coherency_rule_002,
  
  -- Coherency check: Manual override exclusivity
  CASE 
    WHEN NOT (g.is_manual_override AND g.tuned_by_latti)
    THEN 'PASS' 
    ELSE 'FAIL' 
  END AS coherency_rule_005,
  
  -- Migration completeness indicator
  CASE 
    WHEN legacy.id IS NULL 
    THEN 'NEW_MODE'  -- guardrails_v2 record exists but no legacy record
    WHEN legacy.id IS NOT NULL 
    THEN 'MIGRATED'  -- both v2 and legacy records exist
    ELSE 'ORPHANED'  -- should never happen
  END AS migration_status
  
FROM guardrails_v2 g
LEFT JOIN guardrails legacy
  ON legacy.mode = g.mode;

-- ==========================================
-- USAGE EXAMPLES
-- ==========================================

-- View all modes with comparison:
/*
SELECT * FROM v_guardrails_transitional;
*/

-- Check migration completeness:
/*
SELECT mode, migration_status, risk_values_match, cooldown_values_match, positions_match
FROM v_guardrails_transitional;
*/

-- Find modes with coherency violations:
/*
SELECT mode, coherency_rule_001, coherency_rule_002, coherency_rule_005
FROM v_guardrails_transitional
WHERE coherency_rule_001 = 'FAIL' 
   OR coherency_rule_005 = 'FAIL';
*/

-- Compare new vs legacy values side-by-side:
/*
SELECT 
  mode,
  risk_pct AS new_risk_pct,
  legacy_risk_pct,
  cooldown AS new_cooldown,
  legacy_cooldown,
  positions AS new_positions,
  legacy_positions
FROM v_guardrails_transitional;
*/

-- ==========================================
-- ANALYTICS QUERIES
-- ==========================================

-- Report: Migration Delta Analysis
/*
SELECT 
  mode,
  risk_pct - COALESCE(legacy_risk_pct, 0) AS risk_delta,
  cooldown - COALESCE(legacy_cooldown, 0) AS cooldown_delta,
  positions - COALESCE(legacy_positions, 0) AS positions_delta,
  migration_status
FROM v_guardrails_transitional;
*/

-- Report: Coherency Compliance Summary
/*
SELECT 
  COUNT(*) AS total_modes,
  SUM(CASE WHEN coherency_rule_001 = 'PASS' THEN 1 ELSE 0 END) AS rule_001_pass,
  SUM(CASE WHEN coherency_rule_002 = 'PASS' THEN 1 ELSE 0 END) AS rule_002_pass,
  SUM(CASE WHEN coherency_rule_005 = 'PASS' THEN 1 ELSE 0 END) AS rule_005_pass
FROM v_guardrails_transitional;
*/

-- ==========================================
-- CLEANUP (Phase 4)
-- ==========================================

-- Once legacy guardrails table is deprecated (Phase 4):
-- 1. Create simplified view without legacy columns
-- 2. Drop v_guardrails_transitional
-- 3. Archive legacy guardrails table data for historical analysis

-- DROP VIEW IF EXISTS v_guardrails_transitional;

-- ==========================================
-- NOTES
-- ==========================================

-- This view serves as a "Rosetta Stone" during Phase 2-3 transition
-- Allows analysts to verify migration accuracy without disrupting operations
-- 
-- Expected timeline:
-- - Phase 2: View created alongside guardrails_v2 deployment
-- - Phase 3: View continues to provide comparison during Lottie Controls rollout
-- - Phase 4: View deprecated when legacy guardrails table is dropped
--
-- ==========================================
-- END OF TRANSITIONAL VIEW
-- ==========================================

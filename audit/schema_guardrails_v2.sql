-- ==========================================
-- Phase 2: Guardrails V2 Schema
-- LATTi Goals + Guardrails Modernization
-- ==========================================
--
-- PURPOSE: Reference SQL for guardrails_v2 table structure
-- NOTE: This is DOCUMENTATION ONLY - actual migration via Drizzle ORM
-- Execution: npm run db:push --force (after updating shared/schema.ts)
--
-- IMPORTANT: Do NOT execute this SQL manually
-- The Drizzle schema in shared/schema.ts is the source of truth
-- ==========================================

-- Core Four Guardrails Table (Mode-Global)
CREATE TABLE IF NOT EXISTS guardrails_v2 (
  -- Primary key (UUID)
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Mode isolation (UNIQUE constraint ensures one record per mode)
  mode trading_mode NOT NULL,
  
  -- CORE FOUR GUARDRAILS (percent-based, portfolio-relative)
  
  -- 1. Portfolio Risk per Trade (%)
  --    Percentage of total portfolio value risked on each trade
  --    Range: 0.10% - 5.00%
  --    Example: 0.90% means risk $9 on a $1000 portfolio
  portfolio_risk_per_trade_pct DECIMAL(5,2) NOT NULL DEFAULT 1.50
    CHECK (portfolio_risk_per_trade_pct >= 0.10 AND portfolio_risk_per_trade_pct <= 5.00),
  
  -- 2. Symbol Cooldown (minutes)
  --    Minimum time before re-trading the same symbol
  --    Range: 1 - 90 minutes
  --    Example: 15 means wait 15 minutes before trading BTC/USD again
  symbol_cooldown_minutes INTEGER NOT NULL DEFAULT 15
    CHECK (symbol_cooldown_minutes >= 1 AND symbol_cooldown_minutes <= 90),
  
  -- 3. Max Open Positions (count)
  --    Maximum number of concurrent open trades
  --    Range: 1 - 20 positions
  --    Example: 5 means maximum 5 trades open at once
  max_open_positions INTEGER NOT NULL DEFAULT 5
    CHECK (max_open_positions >= 1 AND max_open_positions <= 20),
  
  -- 4. Daily Loss Kill Switch (%)
  --    Portfolio loss percentage triggering automatic shutdown
  --    Range: 1.00% - 20.00%
  --    Example: 7.00% means shut down if daily loss exceeds 7% of portfolio
  daily_loss_kill_switch_pct DECIMAL(5,2) NOT NULL DEFAULT 7.00
    CHECK (daily_loss_kill_switch_pct >= 1.00 AND daily_loss_kill_switch_pct <= 20.00),
  
  -- PHASE 3 CONTROLS (Lottie vs Manual Override)
  
  -- Manual override flag (true = user controls, false = LATTI controls)
  is_manual_override BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- LATTI-tuned flag (true = LATTI manages, false = manual)
  tuned_by_latti BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Ensure mutual exclusivity (cannot be both manual and LATTI-controlled)
  CHECK (NOT (is_manual_override AND tuned_by_latti)),
  
  -- Timestamp of last update
  last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- Mode uniqueness constraint
  CONSTRAINT guardrails_v2_mode_unique UNIQUE (mode)
);

-- Unique index on mode (ensures one record per mode)
CREATE UNIQUE INDEX IF NOT EXISTS guardrails_v2_mode_idx ON guardrails_v2(mode);

-- ==========================================
-- COHERENCY RULES (enforced via CHECK constraints + backend)
-- ==========================================

-- RULE_001: portfolio_risk_per_trade_pct <= daily_loss_kill_switch_pct / 10
--   Ensures at least 10 losing trades before hitting kill switch
--   Backend enforcement in PUT /api/guardrails

-- RULE_002: max_open_positions * portfolio_risk_per_trade_pct <= 100
--   Prevents total exposure from exceeding 100% of portfolio
--   Warning-level (not CHECK constraint) - backend enforcement

-- RULE_003: symbol_cooldown_minutes >= 1
--   Enforced via CHECK constraint above

-- RULE_004: symbol_cooldown_minutes <= 90
--   Enforced via CHECK constraint above (warning-level)

-- RULE_005: NOT (is_manual_override AND tuned_by_latti)
--   Enforced via CHECK constraint above

-- RULE_006: portfolio_risk_per_trade_pct range
--   Enforced via CHECK constraint above

-- RULE_007: daily_loss_kill_switch_pct range
--   Enforced via CHECK constraint above

-- RULE_008: max_open_positions range
--   Enforced via CHECK constraint above

-- RULE_009: Exactly one record per mode
--   Enforced via UNIQUE constraint on mode

-- ==========================================
-- DATA MIGRATION (from legacy tables)
-- ==========================================

-- Migration logic (reference only - execute via execute_sql_tool):
-- 1. Extract current guardrails.risk_per_trade (already percent-based)
-- 2. Extract guardrails.cooldown_minutes
-- 3. Extract guardrails.max_open_positions
-- 4. Extract trading_settings.daily_loss_kill_switch (global value)
-- 5. Insert into guardrails_v2 for both paper and live modes

-- ==========================================
-- TRANSITIONAL VIEW (analytics continuity)
-- ==========================================

-- See: audit/transitional_view_guardrails_v1.sql
-- Purpose: Compare v2 (new) with legacy guardrails during transition

-- ==========================================
-- DEPRECATED FIELDS (removed from v2)
-- ==========================================

-- From guardrails table:
-- - maxDailyLoss (absolute $) → migrated to daily_loss_kill_switch_pct (%)
-- - maxDrawdown (%) → redundant with daily_loss_kill_switch_pct
-- - maxPositionSize (absolute $) → no longer needed (compute from risk %)
-- - maxRiskPerTradeLimit (absolute $) → redundant with portfolio_risk_per_trade_pct
-- - maxRequiredCapital (absolute $) → unused, removed
-- - aiCanAdjust (boolean) → replaced by tuned_by_latti
-- - microLoopInterval (seconds) → kept in legacy table (LATTI-managed)
-- - priceDeltaTrigger (%) → kept in legacy table (LATTI-managed)

-- From tuning_policy table:
-- - cooldownMinutes → duplicate of guardrails.cooldown_minutes (removed)

-- From trading_settings table:
-- - daily_loss_kill_switch → migrated to guardrails_v2.daily_loss_kill_switch_pct
-- - max_position_percent → no longer needed (compute from risk % * positions)

-- ==========================================
-- USAGE EXAMPLES
-- ==========================================

-- Insert default paper mode guardrails:
/*
INSERT INTO guardrails_v2 (mode, portfolio_risk_per_trade_pct, symbol_cooldown_minutes, max_open_positions, daily_loss_kill_switch_pct)
VALUES ('paper', 0.90, 15, 5, 7.00);
*/

-- Insert default live mode guardrails:
/*
INSERT INTO guardrails_v2 (mode, portfolio_risk_per_trade_pct, symbol_cooldown_minutes, max_open_positions, daily_loss_kill_switch_pct)
VALUES ('live', 1.50, 15, 5, 7.00);
*/

-- Query current guardrails for paper mode:
/*
SELECT * FROM guardrails_v2 WHERE mode = 'paper';
*/

-- Update risk per trade (with coherency check):
/*
UPDATE guardrails_v2 
SET portfolio_risk_per_trade_pct = 0.80, 
    last_updated = NOW()
WHERE mode = 'paper'
  AND 0.80 <= daily_loss_kill_switch_pct / 10;  -- RULE_001
*/

-- Check coherency:
/*
SELECT 
  mode,
  portfolio_risk_per_trade_pct,
  daily_loss_kill_switch_pct,
  daily_loss_kill_switch_pct / 10 AS max_allowed_risk,
  CASE 
    WHEN portfolio_risk_per_trade_pct <= daily_loss_kill_switch_pct / 10 
    THEN 'PASS' 
    ELSE 'FAIL' 
  END AS rule_001_check
FROM guardrails_v2;
*/

-- ==========================================
-- INTEGRATION NOTES
-- ==========================================

-- Services reading from guardrails_v2:
-- - RiskManager: portfolio_risk_per_trade_pct, daily_loss_kill_switch_pct
-- - TradingEngine: symbol_cooldown_minutes, max_open_positions
-- - LATTIManager: all Core Four (for auto-tuning bounds)
-- - HeuristicTraderService: respects is_manual_override flag

-- API endpoints:
-- - GET /api/guardrails?mode=paper → reads from guardrails_v2
-- - PUT /api/guardrails?mode=paper → writes to guardrails_v2 with validation

-- Caching:
-- - ConfigBob cache key: `config:guardrails_v2:${mode}`
-- - Invalidated on PUT /api/guardrails

-- WebSocket broadcasts:
-- - Event: `config_changed`
-- - Payload: { configType: 'guardrails', mode: 'paper'|'live' }

-- ==========================================
-- PHASE 3 ADDITIONS (planned)
-- ==========================================

-- Per-parameter manual override tracking:
/*
ALTER TABLE guardrails_v2 
ADD COLUMN locked_by_user JSONB DEFAULT '{
  "portfolioRiskPerTradePct": false,
  "symbolCooldownMinutes": false,
  "maxOpenPositions": false,
  "dailyLossKillSwitchPct": false
}'::jsonb;
*/

-- LATTI adjustment audit log:
/*
CREATE TABLE latti_adjustment_log (
  id SERIAL PRIMARY KEY,
  mode trading_mode NOT NULL,
  parameter_name VARCHAR(50) NOT NULL,
  old_value DECIMAL(10,2),
  new_value DECIMAL(10,2),
  reason TEXT,
  adjusted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
*/

-- ==========================================
-- END OF SCHEMA REFERENCE
-- ==========================================

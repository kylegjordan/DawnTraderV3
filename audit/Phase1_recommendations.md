# Phase 1 Recommendations: LATTi Goals + Guardrails Modernization

## Executive Summary

This Phase 1 audit has identified **17 guardrail parameters** and **16 filter parameters** across the system, with significant architectural conflicts and duplications. The current implementation violates the mode-based global architecture in several critical areas.

### Critical Findings

1. **Architectural Violations**: Risk parameters (`dailyLossKillSwitch`, `maxPositionPercent`) are stored in `trading_settings` table (per-user) instead of `guardrails` table (mode-global)
2. **Parameter Duplication**: `cooldownMinutes` exists in both `guardrails` and `tuningPolicy` tables, creating sync conflicts
3. **Mixed Units**: Risk parameters use both absolute dollars and percentages inconsistently
4. **Legacy Tables**: `strategy_parameters` table has no mode scoping, conflicts with mode-based architecture

### Recommended Path Forward

**Phase 2**: Schema consolidation with "Core Four" guardrails visible in UI
**Phase 3**: Implement "Lottie Controls" with manual override UI pattern
**Phase 4**: Deprecate redundant fields and create analytics transition views

---

## Core Four Guardrails (Phase 2+ UI Surface)

Based on analysis of user workflows, LATTI optimization needs, and risk management requirements, the following **Core Four** guardrails should remain visible and editable in the Goals Engine UI:

### 1. Portfolio Risk per Trade (%)
- **Current State**: `guardrails.riskPerTrade` (stored as %, Phase 27.F.33 displays as portfolio %)
- **Database Column**: `guardrails.riskPerTrade` (decimal 5,2)
- **Display Format**: X.XX% (e.g., 0.90%, 1.50%)
- **Unit**: Percentage of total portfolio value
- **Tooltip**: "Percentage of your total portfolio value risked on each trade"
- **Range**: 0.10% - 5.00%
- **Source of Truth**: `guardrails` table (mode-scoped)
- **Used By**: RiskManager, TradingEngine, LATTI, HeuristicTrader
- **Phase 2 Action**: ✅ KEEP - Already implemented correctly
- **Coherency Rule**: `riskPerTrade ≤ dailyLossKillSwitch / 10`

### 2. Symbol Cooldown (minutes)
- **Current State**: `guardrails.cooldownMinutes` (integer)
- **Database Column**: `guardrails.cooldownMinutes` (integer)
- **Display Format**: X minutes (e.g., 15 minutes)
- **Unit**: Minutes
- **Tooltip**: "Minimum time before trading the same symbol again"
- **Range**: 0 - 90 minutes
- **Source of Truth**: `guardrails` table (mode-scoped)
- **Used By**: TradingEngine, LATTI, HeuristicTrader
- **Phase 2 Action**: ✅ KEEP + Eliminate duplicate in `tuningPolicy`
- **Conflict Resolution**: Remove `tuningPolicy.cooldownMinutes`, read from `guardrails` only

### 3. Max Open Positions (count)
- **Current State**: `guardrails.maxOpenPositions` (integer)
- **Database Column**: `guardrails.maxOpenPositions` (integer)
- **Display Format**: X positions (e.g., 5 positions)
- **Unit**: Count
- **Tooltip**: "Maximum number of concurrent open trades"
- **Range**: 1 - 20 positions
- **Source of Truth**: `guardrails` table (mode-scoped)
- **Used By**: RiskManager, TradingEngine, StrategyEngine
- **Phase 2 Action**: ⚠️ REVIEW - May be redundant if LATTI fully controls this
- **Note**: Consider if this is needed as hard limit or if LATTI optimization is sufficient

### 4. Daily Loss Kill Switch (%)
- **Current State**: `trading_settings.dailyLossKillSwitch` (decimal 5,2) ⚠️ WRONG TABLE
- **Target Database Column**: `guardrails.dailyLossKillSwitch` (NEW - to be added)
- **Display Format**: X.XX% (e.g., 7.00%)
- **Unit**: Percentage of portfolio value
- **Tooltip**: "Maximum daily loss before automatic trading halt"
- **Range**: 1.00% - 20.00%
- **Source of Truth**: Should be `guardrails` table (mode-scoped)
- **Used By**: RiskManager, TradingEngine
- **Phase 2 Action**: 🔥 MIGRATE from `trading_settings` to `guardrails` table
- **Coherency Rule**: `dailyLossKillSwitch ≥ riskPerTrade * 10`

---

## Deprecation Candidates (Phase 2 Schema Changes)

### Immediate Deprecation (Remove from Schema)

| Parameter | Table | Reason | Replacement |
|-----------|-------|--------|-------------|
| `maxDailyLoss` | `guardrails` | Absolute $ value - inconsistent with % model | `dailyLossKillSwitch` (%) |
| `maxDrawdown` | `guardrails` | Redundant with `dailyLossKillSwitch` | `dailyLossKillSwitch` (%) |
| `maxPositionSize` | `guardrails` | Absolute $ value - inconsistent with % model | `maxPositionPercent` (%) |
| `maxRiskPerTradeLimit` | `guardrails` | Redundant - `riskPerTrade` % already caps this | Computed from `riskPerTrade` % |
| `maxRequiredCapital` | `guardrails` | Unclear purpose - not actively used | Remove entirely |
| `aiCanAdjust` | `guardrails` | Deprecated - `tuningPolicy.enabled` replaces this | `tuningPolicy.enabled` |
| `cooldownMinutes` | `tuningPolicy` | Duplicate of `guardrails.cooldownMinutes` | Read from `guardrails` only |

### Table-Level Deprecation

| Table | Reason | Replacement Strategy |
|-------|--------|---------------------|
| `strategy_parameters` | No mode scoping - conflicts with architecture | Migrate to `strategy_settings.params` JSONB or create mode-scoped table |

### Partial Deprecation (Migrate Columns)

| Table | Columns to Move | Target Table | Reason |
|-------|----------------|--------------|--------|
| `trading_settings` | `dailyLossKillSwitch`, `maxPositionPercent` | `guardrails` | Risk parameters should be mode-global, not per-user |

---

## Coherency Rules (Draft for Phase 2 Implementation)

### Rule 1: Risk Per Trade Coherency
```yaml
rule: risk_per_trade_coherency
formula: riskPerTrade (%) ≤ dailyLossKillSwitch (%) / 10
rationale: "Ensure at least 10 losing trades needed to hit daily loss limit"
enforcement: Backend validation on guardrails PUT
error_message: "Risk per trade cannot exceed 10% of daily loss kill switch"
```

### Rule 2: Portfolio Exposure Cap
```yaml
rule: portfolio_exposure_cap
formula: maxOpenPositions * riskPerTrade (%) ≤ maxPositionPercent (%)
rationale: "Prevent total exposure from exceeding position sizing limit"
enforcement: Backend validation on guardrails PUT
error_message: "Total exposure (positions × risk) cannot exceed max position percent"
note: "If maxPositionPercent removed, use hardcoded cap of 50%"
```

### Rule 3: Symbol Cooldown Consistency
```yaml
rule: cooldown_consistency
formula: guardrails.cooldownMinutes === tuningPolicy.cooldownMinutes (if tuningPolicy exists)
rationale: "Single source of truth for cooldown period"
enforcement: Sync on guardrails PUT, deprecate tuningPolicy.cooldownMinutes in Phase 2
error_message: N/A (sync automatic)
```

### Rule 4: Risk Parameter Units Consistency
```yaml
rule: all_risk_percent_based
formula: All risk parameters expressed as % of portfolio value
rationale: "Consistent semantics - no absolute dollar values"
enforcement: Schema-level (Phase 2 migration)
affected_fields: riskPerTrade, dailyLossKillSwitch, maxPositionPercent
```

### Rule 5: LATTI Tuning Bounds
```yaml
rule: latti_tuning_bounds
formula: tuningPolicy.fieldBounds respects guardrails limits
rationale: "LATTI cannot optimize parameters beyond guardrail safety limits"
enforcement: Backend validation on tuning/enable
error_message: "LATTI field bounds must stay within guardrail limits"
```

---

## Source-of-Truth Assignments

### Guardrails (Risk Management)

| Parameter | Source of Truth Table | Column | Scope | Notes |
|-----------|----------------------|---------|-------|-------|
| Portfolio Risk per Trade (%) | `guardrails` | `riskPerTrade` | mode-global | ✅ Correct |
| Symbol Cooldown (minutes) | `guardrails` | `cooldownMinutes` | mode-global | ✅ Correct - eliminate tuningPolicy duplicate |
| Max Open Positions | `guardrails` | `maxOpenPositions` | mode-global | ✅ Correct |
| Daily Loss Kill Switch (%) | `guardrails` | `dailyLossKillSwitch` (NEW) | mode-global | 🔥 Migrate from `trading_settings` |
| Max Position Percent (%) | `guardrails` | `maxPositionPercent` (NEW) | mode-global | 🔥 Migrate from `trading_settings` |
| Micro-Loop Interval | `guardrails` | `microLoopInterval` | mode-global | ✅ Correct (hide from UI - LATTI-managed) |
| Price Delta Trigger | `guardrails` | `priceDeltaTrigger` | mode-global | ✅ Correct (hide from UI - LATTI-managed) |

### Filters (Market Screening)

| Parameter | Source of Truth Table | Column | Scope | Notes |
|-----------|----------------------|---------|-------|-------|
| All volume/price/market cap filters | `screener_filters` | Individual columns | mode-global | ✅ Correct |
| Universe Size | `screener_filters` | `universeSize` | mode-global | ✅ Correct |
| Quote Currencies | `screener_filters` | `quoteCurrencies` (JSONB) | mode-global | ✅ Correct |
| Active Timeframes | `screener_filters` | `activeTimeframes` (JSONB) | mode-global | ✅ Correct |
| Confidence Threshold | `screener_filters` | `confidenceThreshold` | mode-global | ✅ Correct |

### Strategy Settings

| Parameter | Source of Truth Table | Column | Scope | Notes |
|-----------|----------------------|---------|-------|-------|
| Per-strategy params | `strategy_settings` | `params` (JSONB) | globalContextId + mode + strategy | ✅ Correct |
| ❌ Global strategy params | `strategy_parameters` | Various | ❌ NO MODE SCOPING | 🔥 DEPRECATE table |

### LATTI Tuning

| Parameter | Source of Truth Table | Column | Scope | Notes |
|-----------|----------------------|---------|-------|-------|
| Tuning Enabled | `tuning_policy` | `enabled` | per-user+mode | ⚠️ Should be mode-global |
| Aggressiveness | `tuning_policy` | `aggressiveness` | per-user+mode | ⚠️ Should be mode-global |
| Field Bounds | `tuning_policy` | `fieldBounds` (JSONB) | per-user+mode | ⚠️ Should be mode-global |
| Max Step Percent | `tuning_policy` | `maxStepPercent` | per-user+mode | ✅ OK (LATTI-specific) |
| Max Daily Adjustments | `tuning_policy` | `maxDailyAdjustments` | per-user+mode | ✅ OK (LATTI-specific) |
| ❌ Cooldown Minutes | `tuning_policy` | `cooldownMinutes` | per-user+mode | 🔥 DEPRECATE - read from `guardrails` |

### Trading State

| Parameter | Source of Truth Table | Column | Scope | Notes |
|-----------|----------------------|---------|-------|-------|
| Engine Active | `system_context` | `isEngineActive` | tradingMode (2 rows total) | ✅ Correct |
| Trading Mode | `system_context` | `tradingMode` | tradingMode | ✅ Correct |
| LATTI Enabled | `system_context` | `lattiEnabled` | tradingMode | ✅ Correct |

---

## Phase 2 Migration Plan (Schema Changes)

### Step 1: Add New Columns to Guardrails Table

```sql
-- Add Core Four missing columns
ALTER TABLE guardrails 
  ADD COLUMN daily_loss_kill_switch DECIMAL(5,2) DEFAULT 7.00,
  ADD COLUMN max_position_percent DECIMAL(5,2) DEFAULT 10.00;

-- Add constraints
ALTER TABLE guardrails 
  ADD CONSTRAINT check_daily_loss_range 
    CHECK (daily_loss_kill_switch >= 1.00 AND daily_loss_kill_switch <= 20.00);
    
ALTER TABLE guardrails 
  ADD CONSTRAINT check_max_position_range 
    CHECK (max_position_percent >= 1.00 AND max_position_percent <= 50.00);
```

### Step 2: Migrate Data from trading_settings

```sql
-- Migrate dailyLossKillSwitch to guardrails (paper mode)
UPDATE guardrails g
SET daily_loss_kill_switch = (
  SELECT daily_loss_kill_switch 
  FROM trading_settings ts
  LIMIT 1  -- Global setting, pick any user's value
)
WHERE g.mode = 'paper';

-- Migrate maxPositionPercent to guardrails (paper mode)
UPDATE guardrails g
SET max_position_percent = (
  SELECT max_position_percent
  FROM trading_settings ts
  LIMIT 1  -- Global setting, pick any user's value
)
WHERE g.mode = 'paper';

-- Repeat for live mode
-- (similar UPDATE statements for mode='live')
```

### Step 3: Remove Deprecated Columns

```sql
-- Remove absolute dollar value columns (deprecated)
ALTER TABLE guardrails 
  DROP COLUMN max_daily_loss,
  DROP COLUMN max_drawdown,
  DROP COLUMN max_position_size,
  DROP COLUMN max_risk_per_trade_limit,
  DROP COLUMN max_required_capital,
  DROP COLUMN ai_can_adjust;

-- Remove duplicate cooldown from tuning_policy
ALTER TABLE tuning_policy
  DROP COLUMN cooldown_minutes;

-- Remove risk params from trading_settings (after migration)
ALTER TABLE trading_settings
  DROP COLUMN daily_loss_kill_switch,
  DROP COLUMN max_position_percent;
```

### Step 4: Deprecate strategy_parameters Table

```sql
-- Create analytics transition view (preserve for reporting)
CREATE VIEW strategy_parameters_legacy AS
SELECT * FROM strategy_parameters;

-- Eventually drop table (after analytics migration)
-- DROP TABLE strategy_parameters;
```

### Step 5: Refactor tuningPolicy to Mode-Global

```sql
-- Add unique constraint on mode only (remove userId from PK)
-- This requires data migration and architectural refactor
-- Defer to Phase 3 (Lottie Controls implementation)
```

---

## Phase 3-4: "Lottie Controls" UI Pattern

### Concept

**Default State**: LATTI manages all Core Four guardrails automatically
**Manual Override**: User can manually set values, locking LATTI out for that parameter
**UI Pattern**: Toggle switch on each Core Four parameter ("Lottie Controls" vs "Manual")

### Implementation Requirements

1. **Database Schema**:
   - Add `is_manual_override` boolean column to `guardrails` table
   - Add `locked_by_user` jsonb column: `{ "riskPerTrade": true, "cooldownMinutes": false, ... }`

2. **UI Components**:
   - Goals Engine > Guardrails Tab: Add toggle for each Core Four parameter
   - Default: Locked icon (Lottie controls), grayed out input
   - Manual: Unlocked icon, editable input

3. **Backend Logic**:
   - LATTI `HeuristicTraderService` skips adjustment for locked parameters
   - `PUT /api/guardrails` sets `locked_by_user[param] = true` when user edits
   - WebSocket broadcast when LATTI adjusts non-locked parameters

### Example UI (Goals Engine > Guardrails Tab)

```
┌─────────────────────────────────────────────┐
│  Core Four Guardrails                       │
├─────────────────────────────────────────────┤
│                                             │
│  Portfolio Risk per Trade (%)               │
│  ┌──────────────────────────────────────┐  │
│  │  [LOCK🔒] Lottie Controls   0.90%   │  │ ← Locked (LATTI manages)
│  └──────────────────────────────────────┘  │
│                                             │
│  Symbol Cooldown (minutes)                  │
│  ┌──────────────────────────────────────┐  │
│  │  [UNLOCK🔓] Manual  [15 ▼]         │  │ ← Unlocked (user controls)
│  └──────────────────────────────────────┘  │
│                                             │
│  ... (Max Open Positions, Daily Loss %)    │
└─────────────────────────────────────────────┘
```

---

## Open Questions for User / Phase 2 Planning

### 1. maxOpenPositions Necessity
**Question**: Is `maxOpenPositions` needed as a hard guardrail, or can LATTI fully control this?  
**Rationale**: If LATTI always optimizes position count within safe bounds, a user-editable hard limit may be redundant.  
**Recommendation**: Review with user whether to keep as Core Four or demote to LATTI-managed parameter.

### 2. maxPositionPercent vs Computed Cap
**Question**: Should `maxPositionPercent` be a standalone Core Four guardrail, or computed from `maxOpenPositions * riskPerTrade`?  
**Rationale**: Computing eliminates redundancy but reduces user control granularity.  
**Recommendation**: If kept separate, enforce coherency rule. If computed, document formula clearly.

### 3. strategy_parameters Migration Path
**Question**: Migrate global strategy parameters to mode-scoped table or embed in `strategy_settings.params` JSONB?  
**Rationale**: JSONB is flexible but harder to query; dedicated table is structured but adds complexity.  
**Recommendation**: Embed in JSONB for simplicity, document schema in code comments.

### 4. tuningPolicy Architecture Change Timing
**Question**: Refactor `tuningPolicy` to mode-global in Phase 2 or defer to Phase 3 with Lottie Controls?  
**Rationale**: Architectural consistency vs complexity of simultaneous changes.  
**Recommendation**: Defer to Phase 3 - combine with Lottie Controls for unified "LATTI management" feature.

---

## Client UI Inventory

### Goals Engine Components

| Component | File Path | Read/Write | Mode-Scoped | Guardrails | Filters | Notes |
|-----------|-----------|------------|-------------|------------|---------|-------|
| GuardrailsTab | `client/src/components/goals/guardrails-tab.tsx` | Read+Write | ✅ Yes | ✅ | ❌ | Edits `guardrails` table, includes "Copy to Live" modal |
| ScreenerFiltersTab | `client/src/components/goals/screener-filters-tab.tsx` | Read+Write | ✅ Yes | ❌ | ✅ | Edits `screener_filters` table |
| GoalsEngineTab | `client/src/components/goals/goals-engine-tab.tsx` | Container | ✅ Yes | ❌ | ❌ | Container for TradingPaceControl + TargetDailyGoals |
| TradingPaceControl | `client/src/components/goals/trading-pace-control.tsx` | Read+Write | ❌ Global | Read-only | Read-only | Sets global trading pace, fetches LATTI targets |
| TargetDailyGoals | `client/src/components/goals/target-daily-goals.tsx` | Read+Write | ✅ Yes | Read-only | Read-only | Edits target daily earnings %, validates against guardrails |

### Dashboard Widgets

| Component | File Path | Read/Write | Mode-Scoped | Guardrails | Filters | Notes |
|-----------|-----------|------------|-------------|------------|---------|-------|
| LATTIGoalsMirror | `client/src/components/dashboard/latti-goals-mirror.tsx` | Read-only | ✅ Yes | Read-only | ❌ | Mirrors LATTI targets from Goals Engine |
| LATTIDashboardWidget | `client/src/components/dashboard/latti-dashboard-widget.tsx` | Read-only | ✅ Yes | Read-only | ❌ | Displays LATTI trading pace + projections |
| FilterHealthWidget | `client/src/components/dashboard/filter-health-widget.tsx` | Read-only | ✅ Yes | ❌ | Read-only | Live diagnostic metrics from scanner |

### Other Components

| Component | File Path | Read/Write | Mode-Scoped | Guardrails | Filters | Notes |
|-----------|-----------|------------|-------------|------------|---------|-------|
| AIOpportunitiesTab | `client/src/components/ai/ai-opportunities-tab.tsx` | Read-only | ✅ Yes | ❌ | Read-only | Displays AI opportunities (influenced by filters) |

### UI State Summary

- **Editable Guardrails**: GuardrailsTab only (Goals Engine)
- **Editable Filters**: ScreenerFiltersTab only (Goals Engine)
- **Read-Only Displays**: All dashboard widgets, LATTI widgets, AI Opportunities
- **"Managed by Lottie" Toggles**: ❌ Not implemented yet (Phase 3 feature)
- **Live Mode Disabled Controls**: ✅ Implemented in GuardrailsTab (no editing in Live mode without confirmation)

---

## Summary & Next Steps

### Phase 1 Complete ✅

- Database schema mapped (7 core tables + deprecation candidates)
- API endpoints documented (20+ endpoints)
- Guardrails inventory (17 parameters)
- Filters inventory (16 parameters)
- Conflicts identified (14 conflict scenarios)
- Source-of-Truth assigned for all parameters
- Core Four guardrails selected

### Phase 2: Schema Consolidation

1. Add `dailyLossKillSwitch` and `maxPositionPercent` to `guardrails` table
2. Migrate data from `trading_settings` to `guardrails`
3. Remove deprecated columns (`maxDailyLoss`, `maxDrawdown`, etc.)
4. Eliminate `cooldownMinutes` duplicate from `tuningPolicy`
5. Deprecate `strategy_parameters` table
6. Implement coherency rules backend validation
7. Create `schema_guardrails_v2.sql` migration script
8. Update API endpoints to use new schema

### Phase 3: Lottie Controls UI

1. Add `locked_by_user` JSONB column to `guardrails`
2. Implement toggle switches in GuardrailsTab for Core Four
3. Update LATTI `HeuristicTraderService` to respect locks
4. Add WebSocket broadcasts for LATTI auto-adjustments
5. Refactor `tuningPolicy` to mode-global architecture

### Phase 4: Analytics Transition

1. Create legacy views for deprecated fields
2. Update reporting queries to use Core Four
3. Archive historical data from deprecated tables
4. Document final coherency rules in `coherency_rules.yaml`

---

## Appendix: Affected Services & Dependencies

### Services Reading Guardrails
- `RiskManager` (all risk parameters)
- `TradingEngine` (position sizing, cooldowns)
- `StrategyEngine` (execution timing)
- `LATTIManager` (tuning bounds)
- `HeuristicTraderService` (parameter optimization)
- `MicroExecutionService` (micro-loop params)
- `ConfigBob` (caching layer)

### Services Reading Filters
- `MarketScanner` (pair filtering)
- `FilteredPairsService` (watchlist population)
- `PaperSimDiagnosticService` (diagnostics)
- `StrategyEngine` (signal confidence)
- `ConfigBob` (caching layer)

### API Endpoints Affected by Phase 2 Changes
- `/api/guardrails` (GET/PUT) - Add new Core Four fields
- `/api/settings` (GET/PUT) - Remove risk parameters
- `/api/tuning/policy` (GET) - Remove cooldownMinutes
- `/api/tuning/enable` (POST) - Remove cooldownMinutes sync
- `/api/latti/targets` (GET) - Update calculations with new fields

### UI Components Affected by Phase 2 Changes
- `GuardrailsTab` - Add dailyLossKillSwitch, maxPositionPercent inputs
- `TradingPaceControl` - Update LATTI targets fetch
- `TargetDailyGoals` - Update validation logic
- `LATTIGoalsMirror` - Update display fields
- All widgets referencing deprecated fields

---

**End of Phase 1 Recommendations**  
**Status**: Ready for Phase 2 Planning & Implementation  
**Date**: October 28, 2025

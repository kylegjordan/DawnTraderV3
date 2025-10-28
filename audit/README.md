# Phase 1: LATTi Goals + Guardrails Modernization Audit

## Overview
This directory contains the comprehensive Phase 1 audit of guardrails, filters, strategy settings, and trading parameters across the entire system architecture.

## Audit Objective
Inventory and classify every guardrail and filter reference across database, API, and client to understand overlaps, dependencies, and conflicts before simplification.

## Methodology
1. **Repository Mapping**: Database → API → Client
2. **Comprehensive Inventories**: Guardrails, Filters, Parameters
3. **Conflict Analysis**: Identify duplicates, contradictions, overlaps
4. **Source-of-Truth Assignment**: Define single authoritative sources

## Audit Scope
- **Database**: Mode-scoped global settings (Paper/Live)
- **API**: All `/api` routes for guardrails/filters/settings
- **Client**: Goals Engine, LATTI widgets, Filter tabs

## Key Architectural Principles
1. **Mode-Based Global Settings**: One engine per mode (Paper/Live), shared by all users
2. **NO User-Scoped Settings**: All guardrails/filters are global per mode
3. **LATTI as Local Optimizer**: Autonomous parameter tuning within guardrail bounds
4. **Database-Driven Everything**: Zero hardcoded values in code

## Deliverables

### 1. `db_map.json`
Complete database schema mapping for all relevant tables with columns, types, constraints, and mode scoping.

### 2. `endpoints_map.json`
Comprehensive mapping of all API endpoints that read/write guardrails, filters, strategy settings, and engine state.

### 3. `guardrails_inventory.csv`
Complete inventory of all guardrail parameters with scope, defaults, API endpoints, database columns, and usage.

### 4. `filters_inventory.csv`
Complete inventory of all filter parameters with categories, types, scope, and usage by scanner/strategy.

### 5. `conflicts_matrix.csv`
Analysis of parameter duplications, contradictions, and overlaps with recommended resolutions.

### 6. `Phase1_recommendations.md`
Written recommendations including:
- Core Four Guardrails to keep visible
- Fields to deprecate in Phase 2
- Coherency rules (draft)
- Source-of-Truth assignments

## Testing Credentials
- **Username**: testuser123
- **Password**: SecurePass123!

## Status
**Phase**: 2 of 4 (Schema Consolidation)  
**Status**: Complete  
**Date**: October 28, 2025

---

## Phase 2: Schema Simplification & Source-of-Truth Definition

### Objective
Translate the Phase 1 audit results into a clean, coherent schema and rule set for guardrails. Remove redundancy, enforce percent-based/portfolio-relative metrics, and establish a single source of truth (SoT) for the Core Four Guardrails.

### Phase 2 Deliverables

#### 1. `coherency_rules.yaml`
Comprehensive validation rules for Core Four guardrails including:
- 8 runtime validation rules (RULE_001 through RULE_008)
- Migration-specific validation rules
- Testing matrix with valid/invalid scenarios
- Enforcement strategy (backend + database constraints)

#### 2. `migration_checklist.md`
Step-by-step migration guide including:
- Pre-migration verification steps
- Data migration SQL scripts
- Coherency validation queries
- Rollback plan
- Success criteria

#### 3. `schema_guardrails_v2.sql`
Reference SQL schema documentation for guardrails_v2 table:
- Core Four columns (percent-based, portfolio-relative)
- CHECK constraints for range validation
- Unique index on mode (one record per mode)
- Phase 3 control flags (manual override, LATTI-tuned)

#### 4. `transitional_view_guardrails_v1.sql`
Analytics view for legacy comparison:
- Side-by-side comparison of v2 vs legacy values
- Built-in coherency checks
- Migration status indicators

#### 5. `docs/schema_guardrails_v2_overview.md`
Comprehensive schema documentation including:
- Column definitions and rationale
- Coherency rules with examples
- Migration logic and data flow
- Service integration points
- API request/response schemas

### Implementation Summary

#### Database Changes
- ✅ Created `guardrails_v2` table with Core Four columns
- ✅ Applied CHECK constraints for range validation
- ✅ Created unique index on mode (ensures one record per mode)
- ✅ Created transitional view `v_guardrails_transitional`
- ✅ Migrated data from legacy tables (paper + live modes)
- ✅ All coherency rules PASS validation

#### Code Changes
- ✅ Updated `shared/schema.ts` with guardrails_v2 table definition
- ✅ Created Zod insert schema and TypeScript types
- ✅ Updated `server/storage.ts` with guardrails_v2 methods
- ✅ Added new API endpoints `/api/guardrails-v2` (GET/PUT)
- ✅ Implemented coherency validation in PUT endpoint (RULE_001, RULE_005)

#### Coherency Validation Results
All migrated data passes validation:
```
Mode   | Risk% | Cooldown | Positions | Kill Switch% | All Rules
-------|-------|----------|-----------|--------------|----------
Paper  | 0.53  | 7 min    | 6         | 7.00%        | PASS ✓
Live   | 0.53  | 15 min   | 5         | 7.00%        | PASS ✓
```

### Core Four Guardrails

1. **Portfolio Risk per Trade (%)**: 0.10% - 5.00%  
   Percentage of total portfolio value risked on each trade

2. **Symbol Cooldown (minutes)**: 1 - 90  
   Minimum time before re-trading the same symbol

3. **Max Open Positions (count)**: 1 - 20  
   Maximum number of concurrent open trades

4. **Daily Loss Kill Switch (%)**: 1.00% - 20.00%  
   Portfolio loss percentage triggering automatic shutdown

### Deprecated Fields (Phase 1 Findings)
- `maxDailyLoss` (absolute $) → Use `daily_loss_kill_switch_pct`
- `maxDrawdown` (%) → Redundant with kill switch
- `maxPositionSize` (absolute $) → Compute from risk %
- `maxRiskPerTradeLimit` (absolute $) → Use `portfolio_risk_per_trade_pct`
- `maxRequiredCapital` (absolute $) → Unused
- `aiCanAdjust` (boolean) → Use `tuned_by_latti`
- `tuningPolicy.cooldownMinutes` → Duplicate of `guardrails_v2.symbol_cooldown_minutes`

### API Endpoints

**GET /api/guardrails-v2?mode=paper|live**
- Returns Core Four guardrails for specified mode
- Includes control flags (isManualOverride, tunedByLatti)

**PUT /api/guardrails-v2?mode=paper|live**
- Updates Core Four guardrails with coherency validation
- Validates RULE_001 (risk ≤ kill switch / 10)
- Validates RULE_005 (manual override exclusivity)
- Broadcasts config change events
- Invalidates caches

### Phase 2 Status
**Status**: COMPLETE ✅  
**Migration Date**: October 28, 2025  
**Validation**: All coherency rules PASS

---

## Next Steps (Phase 3+)

### Phase 3: Lottie Controls UI with Manual Override
- Add toggle switches to Goals Engine > Guardrails Tab
- Implement per-parameter manual override tracking
- Update LATTI to respect `is_manual_override` flag
- WebSocket broadcasts for LATTI auto-adjustments

### Phase 4: Legacy Deprecation & Analytics Transition
- Drop deprecated columns from guardrails table
- Drop tuning_policy.cooldownMinutes column
- Drop strategy_parameters table
- Finalize analytics transition views

# Phase 8.8.3-H4 — Risk Manager Usage Audit

**Date**: December 1, 2025  
**Phase**: REB 8.8.3-H4  
**Status**: IN PROGRESS — Critical Trading Path Migrated

## Executive Summary

The legacy `risk-manager.ts` module is deeply embedded in the trading path, creating hidden risk controls that are not visible in the UI or controlled via the Guardrails tab. This audit documents all usage locations and the migration plan.

## Migration Progress

### Completed (Critical Trading Path)
✅ Created `server/services/guardrail-settings.ts` with pure functions:
   - `buildSettingsFromGuardrails()` - Builds settings from guardrails_v2
   - `getPortfolioBalanceV2()` - Gets portfolio balance from portfolio_state
   - `getRiskPercentageV2()` - Gets risk percentage from guardrails_v2  
   - `calculateRiskAmount()` - Pure calculation function

✅ Created `server/services/trade-safety.ts` with guardrail-driven checks:
   - `checkGuardrailRisk()` - Main pre-trade validation function
   - Exports: `buildSettingsFromGuardrails`, `calculateRiskAmount`, `TradeCandidate`
   - All checks use `[8.8.3-H4][GUARDRAIL_BLOCK]` logging prefix

✅ Updated critical trading files:
   - `trading-engine.ts` - Uses checkGuardrailRisk and buildSettingsFromGuardrails
   - `trade-executor.ts` - Uses checkGuardrailRisk (BaseTradeExecutor class)
   - `paper-execution-engine.ts` - Uses checkGuardrailRisk
   - `pre-execution-validator.ts` - Uses checkGuardrailRisk
   - `paper-execution.ts` - Uses checkGuardrailRisk  
   - `routes.ts` - Import updated to include trade-safety exports

### In Progress
- `routes.ts` - Multiple buildSettingsFromModeLevel usages need migration
- `heuristic-trader.ts` - Still uses RiskManager for adjustments
- `daily-brief.ts` - Still uses RiskManager
- `behavioral-template.ts` - Still uses RiskManager
- `paper-sim-diagnostic.ts` - Still uses RiskManager

### Not Started
- Archive risk-manager.ts to legacy folder

## Current Usage Locations

### 1. Direct Imports (Static)

| File | Line | Import |
|------|------|--------|
| server/routes.ts | 13 | `import { RiskManager, buildSettingsFromModeLevel } from "./services/risk-manager"` |
| server/services/paper-execution-engine.ts | 4 | `import { RiskManager, buildSettingsFromModeLevel } from './risk-manager'` |
| server/services/trading-engine.ts | 2 | `import { RiskManager, buildSettingsFromModeLevel } from './risk-manager'` |
| server/services/trade-executor.ts | 13 | `import { RiskManager, buildSettingsFromModeLevel, calculateRiskAmount } from './risk-manager.js'` |
| server/services/behavioral-template.ts | 3 | `import { RiskManager } from './risk-manager'` |
| server/services/pre-execution-validator.ts | 2 | `import { RiskManager } from './risk-manager'` |
| server/services/paper-execution.ts | 2 | `import { RiskManager } from './risk-manager'` |
| server/services/daily-brief.ts | 2 | `import { RiskManager } from './risk-manager'` |
| server/services/paper-sim-diagnostic.ts | 8 | `import { RiskManager } from './risk-manager.js'` |
| server/test-guardrails.ts | 14 | `import { RiskManager } from './services/risk-manager'` |

### 2. Dynamic Imports

| File | Line | Import |
|------|------|--------|
| server/routes.ts | 1069 | `await import('./services/risk-manager.js')` - buildSettingsFromModeLevel |
| server/routes.ts | 3318, 3404, 3483 | `await import('./services/risk-manager.js')` - getPortfolioBalanceV2 |
| server/routes.ts | 8375 | `await import('./services/risk-manager')` - RiskManager |
| server/routes.ts | 8442, 8593 | `await import('./services/risk-manager.js')` - getRiskPercentage, calculateRiskAmount |
| server/services/paper-sim-service.ts | 163 | `await import('./risk-manager.js')` - buildSettingsFromModeLevel |
| server/services/trading-state-sync.ts | 211 | `await import('./risk-manager.js')` - RiskManager |
| server/services/bobs/trading-bob.ts | 113 | `await import('../risk-manager.js')` - getRiskPercentageV2, calculateRiskAmount |
| server/services/paper-metrics.ts | 56, 353 | `await import('./risk-manager.js')` - getPortfolioBalanceV2 |
| server/services/ai-analyst.ts | 932 | `await import('./risk-manager.js')` - getPortfolioBalanceV2 |
| server/services/heuristic-trader.ts | 124 | `await import('./risk-manager')` - RiskManager |
| server/services/pre-execution-validator.ts | 45 | `await import('./risk-manager.js')` - buildSettingsFromModeLevel, calculateRiskAmount |
| server/services/paper-execution.ts | 65 | `await import('./risk-manager.js')` - buildSettingsFromModeLevel, calculateRiskAmount |

### 3. RiskManager Class Instantiation

| File | Line | Usage |
|------|------|-------|
| server/routes.ts | 78 | `const riskManager = new RiskManager()` |
| server/routes.ts | 8378 | `const riskManager = new RiskManager()` |
| server/services/paper-execution-engine.ts | 37 | `this.riskManager = new RiskManager()` |
| server/services/trade-executor.ts | 57 | `this.riskManager = new RiskManager()` |
| server/services/trading-engine.ts | 44 | `this.riskManager = dependencies?.riskManager || new RiskManager()` |
| server/services/paper-sim-diagnostic.ts | 74 | `this.riskManager = new RiskManager()` |
| server/services/trading-state-sync.ts | 212 | `const riskManager = new RiskManager(storage)` |
| server/services/heuristic-trader.ts | 125 | `const riskManager = new RiskManager()` |
| server/services/behavioral-template.ts | 5 | `const riskManager = new RiskManager()` |
| server/services/pre-execution-validator.ts | 34 | `this.riskManager = new RiskManager()` |
| server/services/paper-execution.ts | 30 | `this.riskManager = new RiskManager()` |
| server/services/daily-brief.ts | 42 | `this.riskManager = new RiskManager()` |
| server/test-guardrails.ts | 34 | `const riskManager = new RiskManager()` |

### 4. checkPreTradeRisk Calls

| File | Line | Context |
|------|------|---------|
| server/routes.ts | 8438 | Test endpoint |
| server/routes.ts | 8662 | Test endpoint |
| server/services/paper-execution-engine.ts | 765 | **CRITICAL**: Main execution path |
| server/services/trade-executor.ts | 72 | Trade execution |
| server/services/trading-engine.ts | 228 | Engine signal processing |
| server/services/pre-execution-validator.ts | 61 | Validation layer |
| server/services/paper-execution.ts | 78 | Paper execution |
| server/test-guardrails.ts | 119, 193 | Test file |

## Risk Checks Currently Applied by RiskManager

1. **Kill Switch** - Checks `killSwitchTripped` flag
2. **Stop-Loss Required** - Ensures every trade has a stop-loss
3. **Max 1 Position Per Asset** - Prevents duplicate positions
4. **Symbol Cooldown** - Time-based cooldown between trades
5. **Position Size Cap** - Max position as % of portfolio (8.8.3-G)
6. **LPCP (Low-Priced Coin Protection)** - 8.8.3-H/H3
7. **Risk Per Trade** - Dollar/percentage risk limit
8. **Available Balance** - Sufficient capital check
9. **Max Exposure** - Total portfolio exposure limit
10. **Max Open Trades** - Concurrent position limit

## Helper Functions to Re-home

| Function | Current Location | New Location |
|----------|-----------------|--------------|
| `buildSettingsFromModeLevel` | risk-manager.ts | guardrail-settings.ts |
| `getPortfolioBalanceV2` | risk-manager.ts | guardrail-settings.ts |
| `getRiskPercentageV2` | risk-manager.ts | guardrail-settings.ts |
| `calculateRiskAmount` | risk-manager.ts | guardrail-settings.ts |
| `getRiskPercentage` (deprecated) | risk-manager.ts | guardrail-settings.ts |
| `checkLowPricedCoinProtection` | risk-manager.ts | trade-safety.ts |
| All `checkPreTradeRisk` logic | risk-manager.ts | trade-safety.ts |

## Migration Plan

1. **Create `server/services/guardrail-settings.ts`**
   - Move `buildSettingsFromModeLevel`, `getPortfolioBalanceV2`, `getRiskPercentageV2`, `calculateRiskAmount`

2. **Create `server/services/trade-safety.ts`**
   - Implement `checkGuardrailRisk()` function
   - Migrate all pre-trade checks from RiskManager
   - Use guardrails_v2 as single source of truth

3. **Update all imports**
   - Replace risk-manager imports with new modules

4. **Remove RiskManager class usage**
   - Replace `checkPreTradeRisk` calls with `checkGuardrailRisk`

5. **Archive risk-manager.ts**
   - Move to `server/legacy/risk-manager-archive.ts`

## Acceptance Criteria

- [ ] No runtime dependency on risk-manager.ts (IN PROGRESS - critical trading path complete)
- [x] All risk checks driven by guardrails_v2 (trade-safety.ts)
- [x] LPCP enforced via trade-safety.ts (with FX conversion support)
- [x] Logging uses `[8.8.3-H4][GUARDRAIL_BLOCK]` prefix

## Files Migrated

| File | Status | Notes |
|------|--------|-------|
| trading-engine.ts | ✅ DONE | Uses buildSettingsFromGuardrails + checkGuardrailRisk |
| trade-executor.ts | ✅ DONE | BaseTradeExecutor uses checkGuardrailRisk |
| paper-execution-engine.ts | ✅ DONE | Uses checkGuardrailRisk |
| pre-execution-validator.ts | ✅ DONE | Uses checkGuardrailRisk |
| paper-execution.ts | ✅ DONE | Uses checkGuardrailRisk |
| routes.ts | PARTIAL | Import updated, some dynamic imports remain |
| heuristic-trader.ts | ❌ TODO | Uses RiskManager for adjustments |
| daily-brief.ts | ❌ TODO | Uses RiskManager |
| behavioral-template.ts | ❌ TODO | Uses RiskManager |
| paper-sim-diagnostic.ts | ❌ TODO | Uses RiskManager |
| test-guardrails.ts | ❌ TODO | Test file, low priority |

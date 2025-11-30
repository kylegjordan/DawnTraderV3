# REB 8.8.3-F Execution Path Notes

**Date:** November 30, 2025  
**Directive:** Enable Paper Trade Execution with Guardrails V2

## Part 1: Execution Blocker Audit

### Location of Blocker
**File:** `server/services/paper-execution-engine.ts`  
**Method:** `processSignal()` (lines 952-973)  
**Blocker:** Early return at line 968 with message:
```
Signal processing disabled (pending guardrails_v2 migration)
```

### Current Flow (Blocked)
```
SignalOrchestrator.evaluatePoolForSignals()
  → paper-execution-engine.processSignal(signal)
    → [BLOCKED] Returns early at line 968
```

### Desired Flow (Restored)
```
SignalOrchestrator.evaluatePoolForSignals()
  → paper-execution-engine.processSignal(signal)
    → buildSettingsFromModeLevel(mode) → guardrails_v2 settings
    → executeSimulatedTrade(signal, settings)
      → riskManager.checkPreTradeRisk(mode, signal, settings)
      → Calculate position size
      → Create trade record
      → Broadcast trade opened event
```

## Modern Components Used

### 1. guardrails_v2 (via guardrail-policy.ts)
- **Purpose:** Single source of truth for mode-level trading parameters
- **Key fields:** 
  - `portfolioRiskPerTradePct` - Risk per trade percentage
  - `maxOpenPositions` - Maximum concurrent positions
  - `symbolCooldownMinutes` - Cooldown between trades on same symbol
  - `dailyLossKillSwitchPct` - Daily loss limit to trigger kill switch
  - `killSwitchTripped` - Boolean to halt all trading

### 2. risk-manager.ts
- **buildSettingsFromModeLevel(mode)** - Fetches guardrails_v2 and builds settings object
- **getRiskPercentageV2(mode, guardrails)** - Gets risk percentage from guardrails
- **getPortfolioBalanceV2(mode)** - Gets portfolio balance from portfolio_state
- **checkPreTradeRisk(mode, signal, settings)** - Full risk validation:
  - Kill switch check
  - Stop-loss required
  - Max positions per asset
  - Symbol cooldown
  - Position size cap
  - Risk per trade
  - Available balance
  - Max exposure
  - Max open trades

### 3. paper-execution-engine.ts
- **processSignal(signal)** - Public entry point for external signals
- **executeSimulatedTrade(signal, settings)** - Opens simulated trade with:
  - Risk manager validation
  - Position sizing
  - Slippage/fees modeling
  - Trade record creation
  - WebSocket broadcast

### 4. Trade Lifecycle (Already Functional)
- **monitorOpenPositions()** - Runs every 5 seconds
- **checkExitConditions()** - Checks stop/target/trailing stops
- **closePosition()** - Closes with P/L, updates portfolio, creates ledger

## Kill Switch Semantics (REB 8.8.3-KS-B)
- `killSwitchTripped` lives in guardrails_v2 table
- Kill switch does NOT block signal generation or RTB display
- Kill switch only blocks:
  - Engine start (checked at `/api/trading/start`)
  - New trade execution (checked in risk manager)
- LATTI cannot start/stop trading or trip/clear kill switch

## Resolution Plan
1. Remove the early-return blocker in `processSignal()`
2. Call `buildSettingsFromModeLevel(mode)` to get guardrails_v2 settings
3. Call `executeSimulatedTrade(signal, settings)` with those settings
4. Add [8.8.3-F] diagnostic logging for trade lifecycle events

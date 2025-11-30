# REB 8.8.3-KS-A — Kill Switch & Trading State Audit

**Date**: November 30, 2025  
**Phase**: REB 8.8.3-KS-A (Read-Only Diagnostic Phase)  
**Status**: COMPLETE  
**Scope**: Kill Switch & Trading State Forensic Mapping

---

## Executive Summary

This audit provides a complete forensic map of DawnTrader's trading state, engine state, passive learning, and kill switch mechanisms. The analysis reveals **one primary kill switch system** (daily loss) plus **one secondary/legacy system** (execution latency) that may require alignment.

### Key Findings

| Finding | Status | Severity |
|---------|--------|----------|
| `isEngineActive[mode]` is single source of truth for trading state | ✅ Correct | - |
| `passiveLearning = !isEngineActive` derivation | ✅ Correct | - |
| Daily loss kill switch properly implemented | ✅ Correct | - |
| LATTI does not set `isEngineActive`, `killSwitchTripped`, or `tradingSuspended` | ✅ Correct | - |
| Coherency rules are validators only, not kill switch triggers | ✅ Correct | - |
| Secondary latency-based kill switch in `realtime-paper-executor.ts` | ⚠️ Deviation | Medium |
| `guardrails_v2.killSwitchTripped` in-memory cache exists | ⚠️ Legacy Pattern | Low |

---

## Section 1: Trading State → Engine State Wiring

### 1.1 Single Source of Truth: `isEngineActive`

**Storage Location**: `system_context` table (per mode: paper, live)

**Field**: `isEngineActive` (boolean)

**Write Locations**:

| File | Line | Action | Trigger |
|------|------|--------|---------|
| `server/routes.ts` | 2654-2655 | `isEngineActive: true` | `/api/trading/start` endpoint |
| `server/routes.ts` | 2775-2776 | `isEngineActive: false` | `/api/trading/stop` endpoint |
| `server/routes.ts` | 2876-2877 | `isEngineActive: false` | `/api/admin/force-stop` endpoint |
| `server/services/trading-state-sync.ts` | 123-128 | `isEngineActive: false` | Startup stale flag reset |
| `server/services/trading-state-sync.ts` | 251-253 | `isEngineActive: isActive` | Debounced state sync |

**Read Locations**:

| File | Line | Purpose |
|------|------|---------|
| `server/routes.ts` | 3059 | `/api/trading-status` endpoint |
| `server/routes.ts` | 3149-3152 | Unified trading state response |
| `server/routes.ts` | 5097-5098 | System flags endpoint |
| `server/services/command-router.ts` | 158-159, 358-360, 439-440 | Walter command mode detection |
| `server/services/baseline-indicator.ts` | 236 | Baseline indicator engine check |

### 1.2 Engine State Impact Matrix

| Component | Checks `isEngineActive`? | Effect When STOPPED |
|-----------|-------------------------|---------------------|
| SignalOrchestrator | Indirectly (via start/stop) | Not started / stopped |
| StrategyEngine | No (stateless) | Called only if orchestrator running |
| FX5 Scanner | Yes | Clears Active Filter Pool |
| 24h Metrics Recording | Yes | Metrics skipped |
| Active Filter Pool | Yes | Pool cleared |
| Passive Learning | Derived | `passiveLearning = !isEngineActive` |

### 1.3 Passive Learning Derivation

**Truth Statement**: Passive learning is NOT a stored flag. It is always derived.

```typescript
// Correct derivation (trading-state-sync.ts, routes.ts)
const passiveLearning = !isEngineActive;
```

**Locations Where Derived**:
- `server/routes.ts:3153` - Trading status endpoint
- `server/services/trading-state-sync.ts` - Broadcast derivation
- `server/services/fx5-scanner.ts` - Pool enforcement gate

---

## Section 2: Daily Loss Kill Switch Logic

### 2.1 24h P/L Calculation

**File**: `server/services/risk-manager.ts` (lines 947-995)

**Method**: `calculate24hPL(userId, settings)`

**Calculation Flow**:
```typescript
// 1. Get realized P/L from last 24h trades
const trades24h = await this.getRealized24hTrades(userId);
const realizedPL = trades24h.reduce((sum, t) => sum + Number(t.realizedPL || 0), 0);

// 2. Calculate portfolio values
const portfolioValueCurrent = basePortfolioValue + realizedPL + unrealizedPL;
const portfolioValueBefore = portfolioValueCurrent - totalPL;

// 3. Calculate loss percentage
const lossPercent = portfolioValueBefore > 0 ? 
  (Math.abs(totalPL) / portfolioValueBefore) * 100 : 0;
```

### 2.2 Threshold Comparison

**File**: `server/services/risk-manager.ts` (lines 1000-1079)

**Method**: `checkKillSwitch(mode, settings)`

```typescript
const killSwitchThreshold = parseFloat(settings.dailyLossKillSwitch || '7.00');
const warningThreshold = (warningTriggerPercent / 100) * killSwitchThreshold;

// Kill switch check
if (pl24h.lossPercent >= killSwitchThreshold) {
  // Trip the kill switch
}

// Warning check
if (pl24h.lossPercent >= warningThreshold) {
  // Issue warning
}
```

### 2.3 Kill Switch Trip Actions

When `lossPercent >= killSwitchThreshold`:

1. **Close all open trades** (line 1031)
2. **Create kill switch event** in database (lines 1034-1043)
3. **Set `tradingSuspended: true`** (line 1046)
4. **Return triggered status** with message

### 2.4 Kill Switch Event Storage

**Table**: `kill_switch_events`

**Fields Stored**:
- `eventType`: 'kill_switch' | 'warning'
- `portfolioValueBefore`, `portfolioValueAfter`
- `lossAmount`, `lossPercent`
- `killSwitchThreshold`
- `tradesClosed`: JSON array of closed trades

### 2.5 Kill Switch Reset

**Endpoints**:
- `POST /api/guardrails-v2/kill-switch/reset?mode=paper|live`
- `POST /api/kill-switch/reset` (DEPRECATED - returns 410)

**Reset Actions** (`guardrail-policy.ts:390-409`):
1. Set `killSwitchTripped: false` in database
2. Clear `killSwitchReason` and `killSwitchTrippedAt`
3. Emit `guardrail.kill_switch.reset` event

---

## Section 3: Manual Trading Toggle Audit

### 3.1 Start Trading (`POST /api/trading/start`)

**File**: `server/routes.ts` (lines 2513-2729)

**Flow**:
```
1. Validate mode (paper/live)
2. Validate Kraken API credentials exist
3. Run pre-flight checks (filters, guardrails)
4. Start correct engine:
   - Paper: startPaperSimulation(userId, options)
   - Live: globalLiveEngine.start()
5. Update system_context: isEngineActive: true
6. Broadcast trading_state_changed
```

**Kill Switch Interaction**: **NONE** - Start does NOT check or interact with kill switch state directly at this endpoint level. However, Walter chat interface DOES check `guardrails_v2.killSwitchTripped` before allowing start commands.

### 3.2 Stop Trading (`POST /api/trading/stop`)

**File**: `server/routes.ts` (lines 2735-2825)

**Flow**:
```
1. Validate mode (paper/live)
2. Stop correct engine:
   - Paper: stopPaperSimulation(userId)
   - Live: globalLiveEngine.stop()
3. Clear Active Filter Pool (enforcePassiveModeIfStopped)
4. Update system_context: isEngineActive: false
5. Broadcast trading_state_changed
```

**Kill Switch Interaction**: **NONE** - Stop does NOT set any kill switch state. It only sets `isEngineActive: false`.

### 3.3 Force Stop (`POST /api/admin/force-stop`)

**File**: `server/routes.ts` (lines 2833-2893)

**Additional Actions**:
- Sets `tradingStatus: 'stopped'` on user record
- Includes admin audit trail in system_context

---

## Section 4: Kill-Switch-Related Flags Matrix

### 4.1 Primary Flags

| Flag | Storage | Purpose | Write Locations | Read Locations |
|------|---------|---------|-----------------|----------------|
| `isEngineActive` | `system_context` table | Engine running state | routes.ts (start/stop), trading-state-sync.ts | All components |
| `killSwitchTripped` | `guardrails_v2` table | Daily loss exceeded | guardrail-policy.ts:tripKillSwitch | routes.ts, storage.ts |
| `tradingSuspended` | Legacy (trading_settings) | Legacy kill switch flag | risk-manager.ts:1046 | risk-manager.ts, market-scanner.ts |

### 4.2 Flag Semantics

#### `killSwitchTripped` (guardrails_v2)

**Writes**:
| File | Line | Action |
|------|------|--------|
| `server/services/guardrail-policy.ts` | 369 | Set to `true` on trip |
| `server/services/guardrail-policy.ts` | 400 | Set to `false` on reset |

**Reads**:
| File | Line | Effect |
|------|------|--------|
| `server/routes.ts` | 1598 | Included in effective guardrails response |
| `server/routes.ts` | 14513 | Walter blocks trading start if tripped |
| `server/storage.ts` | 882 | Included in guardrails summary |
| `server/services/guardrail-policy.ts` | 418 | `isKillSwitchTripped()` check |

#### `tradingSuspended` (Legacy)

**Writes**:
| File | Line | Action |
|------|------|--------|
| `server/services/risk-manager.ts` | 1046 | Set to `true` when kill switch triggers |
| `server/services/alert-action-handler.ts` | 207 | Set to `false` on reset |
| `server/test-guardrails.ts` | 187, 218 | Test setup |

**Reads**:
| File | Line | Effect |
|------|------|--------|
| `server/services/risk-manager.ts` | 170 | Converted to `tradingSuspended` in settings |
| `server/services/risk-manager.ts` | 312-315 | Blocks pre-trade risk check |
| `server/services/risk-manager.ts` | 1006 | Skips kill switch check if already suspended |
| `server/services/market-scanner.ts` | 613-614 | Skips strategies if suspended |
| `server/services/paper-sim-diagnostic.ts` | 462 | Adds guardrail reason |

---

## Section 5: Unexpected Kill-Switch Mechanisms Found

### 5.1 Execution Latency Kill Switch (SECONDARY)

**File**: `server/services/realtime-paper-executor.ts` (lines 201-246)

**Trigger Conditions**:
1. Execution latency > 500ms
2. WebSocket disconnected AND no data > 10 seconds

**Actions**:
```typescript
private activateKillSwitch(reason: string): void {
  this.killSwitchActive = true;
  this.killSwitchReason = reason;
  // Triggers self-repair after 30 second cooldown
}
```

**Scope**: Local to `realtime-paper-executor` module only
**Persistence**: In-memory only (NOT persisted to database)
**Effect**: Blocks new executions in this module

**Assessment**: This is an **INDEPENDENT secondary kill switch** that does not:
- Set `isEngineActive`
- Set `killSwitchTripped` in guardrails_v2
- Set `tradingSuspended`
- Redirect UI to `/kill-switch`

**Recommendation**: Document as operational safeguard, not architectural deviation.

### 5.2 In-Memory `guardrails_v2.killSwitchTripped` Cache

**File**: `server/routes.ts` (line 14513)

**Pattern**:
```typescript
const { guardrails_v2 } = await import('./services/guardrails-v2.js');
const killSwitchTripped = guardrails_v2.killSwitchTripped[targetModeCheck];
```

**Assessment**: This appears to reference an in-memory module that mirrors database state. Used specifically in Walter chat integration to prevent trading start when kill switch is active.

**Recommendation**: Verify this module exists and is properly synchronized with database state.

---

## Section 6: LATTI & Coherency Effects on Trading State

### 6.1 LATTI Write Capabilities

**Service**: `server/services/heuristic-trader.ts`

**LATTI CAN Adjust**:
- Guardrail numeric values (via `updateGuardrails`)
- Screener filter values (via `updateScreeners`)

**Parameters LATTI adjusts**:
```typescript
// From heuristic-trader.ts BOUNDS definition
BOUNDS = {
  portfolioRiskPerTradePct: { min: 0.1, max: 5.0 },
  symbolCooldownMinutes: { min: 0, max: 120 },
  maxOpenPositions: { min: 1, max: 20 },
  // ... filter parameters
}
```

### 6.2 LATTI CANNOT Set

| Field | Verified Location | Status |
|-------|-------------------|--------|
| `isEngineActive` | Not in LATTI write paths | ✅ SAFE |
| `killSwitchTripped` | Not in LATTI write paths | ✅ SAFE |
| `tradingSuspended` | Not in LATTI write paths | ✅ SAFE |
| `dailyLossKillSwitchPct` | Can adjust (numeric value only) | ⚠️ Review |

**Note**: LATTI can adjust the `dailyLossKillSwitchPct` threshold value, but cannot trip or reset the kill switch itself.

### 6.3 Coherency Rules

**Definition**: `audit/coherency_rules.yaml` (10 rules)

**Function**: Validation ONLY

**Key Coherency Rules Affecting Kill Switch**:
- RULE_001: `portfolioRiskPerTradePct <= dailyLossKillSwitchPct * 0.5`
- RULE_007: `dailyLossKillSwitchPct <= 25%`

**Coherency Rule Effects**:
| Effect | Status |
|--------|--------|
| Stop engine | ❌ NO |
| Trip kill switch | ❌ NO |
| Set `tradingSuspended` | ❌ NO |
| Block guardrail save (validation error) | ✅ YES |

**Confirmation**: Coherency rules are pure validators. They return PASS/WARN/FAIL status but do not modify trading state.

---

## Section 7: AutonomyController / SafetyController Audit

### 7.1 AutonomyController

**File**: `server/services/autonomy-controller.ts`

**Purpose**: Meta-cognitive oversight, learning profile updates, strategic calibration

**Kill Switch Interaction**: **NONE**
- Does not write to `isEngineActive`
- Does not write to `killSwitchTripped`
- Does not write to `tradingSuspended`

**Safety Guardrails** (lines 321-340):
- Checks policy violations before self-checks
- Does NOT trip kill switches
- Only blocks self-check operations if safety violated

### 7.2 Safety Telemetry

**Storage**: `safety_telemetry` table

**Purpose**: Audit trail only, not trading control

---

## Section 8: What Currently Stops Trading

### 8.1 What STOPS the Engine (`isEngineActive: false`)

| Trigger | Code Path | Expected Behavior |
|---------|-----------|-------------------|
| User clicks Stop button | `POST /api/trading/stop` | ✅ Correct |
| Admin force stop | `POST /api/admin/force-stop` | ✅ Correct |
| Stale flag reset on startup | `trading-state-sync.ts:123-128` | ✅ Correct |

### 8.2 What BLOCKS New Trades (Kill Switch)

| Trigger | Code Path | Expected Behavior |
|---------|-----------|-------------------|
| 24h loss >= threshold | `risk-manager.ts:checkKillSwitch` | ✅ Correct |
| `tradingSuspended: true` | `risk-manager.ts:312-315` | ✅ Correct (legacy path) |

### 8.3 What SHOULD Stop Trading vs. What SHOULD NOT

| Mechanism | Should Stop? | Currently Stops? | Status |
|-----------|--------------|------------------|--------|
| Manual toggle (user) | ✅ YES | ✅ YES | Correct |
| Daily loss kill switch | ✅ YES | ✅ YES | Correct |
| Coherency validation error | ❌ NO | ❌ NO | Correct |
| LATTI adjustment | ❌ NO | ❌ NO | Correct |
| Execution latency | ⚠️ LOCAL | ⚠️ LOCAL | Review |

---

## Section 9: Architectural Deviation Summary

### 9.1 Confirmed Correct Behaviors

1. ✅ `isEngineActive[mode]` is single authoritative source for trading state
2. ✅ `passiveLearning = !isEngineActive` derivation is consistent
3. ✅ Daily loss kill switch properly calculates 24h P/L and triggers on threshold
4. ✅ Manual trading toggle only affects `isEngineActive`, not kill switch
5. ✅ LATTI adjusts numeric values only, cannot stop engine
6. ✅ Coherency rules are validators only, not kill switch triggers

### 9.2 Items Requiring Review

1. ⚠️ **Dual Kill Switch Flags**: Both `killSwitchTripped` (guardrails_v2) and `tradingSuspended` (legacy) exist
   - **Recommendation**: Consider consolidating to single flag

2. ⚠️ **Latency Kill Switch**: Independent mechanism in `realtime-paper-executor.ts`
   - **Recommendation**: Document as operational safeguard, verify scope

3. ⚠️ **In-Memory Cache**: `guardrails_v2.killSwitchTripped` module needs verification
   - **Recommendation**: Audit cache synchronization with database

---

## Appendix A: Code Path Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          TRADING STATE AUTHORITY                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────┐         ┌─────────────────┐                          │
│   │ User UI Toggle  │────────►│ /api/trading/   │                          │
│   │ (Start/Stop)    │         │ start | stop    │                          │
│   └─────────────────┘         └────────┬────────┘                          │
│                                        │                                    │
│                                        ▼                                    │
│                         ┌──────────────────────────┐                       │
│                         │ storage.updateSystemContext │                     │
│                         │ isEngineActive: true|false │                     │
│                         └──────────────┬───────────┘                       │
│                                        │                                    │
│                                        ▼                                    │
│                         ┌──────────────────────────┐                       │
│                         │   system_context table    │                       │
│                         │ isEngineActive (per mode) │◄──── SINGLE SOURCE   │
│                         └──────────────┬───────────┘       OF TRUTH        │
│                                        │                                    │
│                    ────────────────────┼────────────────────               │
│                    │                   │                   │                │
│                    ▼                   ▼                   ▼                │
│           ┌────────────────┐  ┌────────────────┐  ┌────────────────┐       │
│           │ SignalOrchest. │  │ FX5 Scanner    │  │ 24h Metrics    │       │
│           │ (runs/stops)   │  │ (pool gates)   │  │ (record gates) │       │
│           └────────────────┘  └────────────────┘  └────────────────┘       │
│                                                                             │
│                         DERIVED: passiveLearning = !isEngineActive         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                        DAILY LOSS KILL SWITCH                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────┐                                                       │
│   │ Trade Completes │                                                       │
│   └────────┬────────┘                                                       │
│            │                                                                │
│            ▼                                                                │
│   ┌──────────────────────────┐                                              │
│   │ riskManager.checkKillSwitch │                                           │
│   └──────────────┬───────────┘                                              │
│                  │                                                          │
│                  ▼                                                          │
│   ┌──────────────────────────┐     ┌────────────────────────┐              │
│   │ calculate24hPL()         │────►│ lossPercent >= threshold │             │
│   │ (24h realized P/L)       │     └───────────┬────────────┘              │
│   └──────────────────────────┘                 │                            │
│                                                │ YES                        │
│                                                ▼                            │
│                                    ┌────────────────────────┐              │
│                                    │ 1. Close all trades    │              │
│                                    │ 2. Create KS event     │              │
│                                    │ 3. tradingSuspended=T  │              │
│                                    │ 4. killSwitchTripped=T │              │
│                                    └───────────┬────────────┘              │
│                                                │                            │
│                                                ▼                            │
│                                    ┌────────────────────────┐              │
│                                    │ Frontend redirects to  │              │
│                                    │ /kill-switch page      │              │
│                                    └────────────────────────┘              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

**Document Version**: 1.0  
**Generated**: November 30, 2025  
**Status**: REB 8.8.3-KS-A complete. Kill Switch & Trading State Audit finished. Documentation generated. No logic changed.

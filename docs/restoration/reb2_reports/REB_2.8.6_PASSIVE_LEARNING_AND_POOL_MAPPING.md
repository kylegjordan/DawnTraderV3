# REB 2.8.6 – Passive Learning & Active Filtered Pool Mapping

**Date**: November 25, 2025  
**Phase**: REB 2.8.6 - Passive Learning & Active Filtered Pool Truth Fix  
**Status**: CURRENT STATE MAPPING (Before Implementation)

---

## Executive Summary

This document maps the **current state** of passive learning and Active Filtered Pool implementation before REB 2.8.6 changes. This is a READ-ONLY snapshot showing what exists now, gaps vs truth spec, and what needs to be restored.

**Key Finding**: Passive learning is **partially derived** (for broadcasts) but **NOT automatically persisted** to SystemConfig, causing inconsistency between broadcast state and behavioral gates.

---

## Section 1: Backend Flags & Storage (Current State)

### 1.1 SystemConfig.passiveLearning (Persistent Flag)

**Location**: `server/services/system-config.ts`

**Storage**:
- **Database table**: `system_config` table  
- **Field**: `systemFlags.passiveLearning` (boolean)
- **In-Memory Cache**: `configCache.passiveLearning`

**Initialization** (lines 30-31):
```typescript
if (!config.passiveLearning) {
  await this.updateConfig({ passiveLearning: true }, 'system');
}
```
- Defaults to `true` on first load
- Persists across server restarts

**Access Method** (line 156):
```typescript
static isPassiveLearningEnabled(): boolean {
  return this.configCache?.passiveLearning ?? false;
}
```

**Manual Update Method** (line 88):
```typescript
async updateConfig(
  flags: { passiveLearning?: boolean },
  changedBy: string
): Promise<{ passiveLearning: boolean }>
```

**Current Behavior**:
- ✅ Has persistent storage
- ✅ Can be manually updated
- ✅ Defaults to `true` (correct)
- ❌ **NOT automatically synced with trading state**
- ❌ **No automatic flip when engine starts/stops**

---

### 1.2 Engine Active Flags (Per-Mode State)

**Location**: `server/storage.ts` → `system_context` table (per mode)

**Fields**:
- `isEngineActive` (boolean) - per mode (paper/live)
- `lastStartedBy`, `lastStoppedBy` (audit trail)

**Access**:
```typescript
const context = await storage.getSystemContext(mode);
const isEngineActive = context?.isEngineActive || false;
```

**Updates**: Via `storage.updateSystemContext()` when:
- `/api/trading/start` endpoint → sets `isEngineActive: true`
- `/api/trading/stop` endpoint → sets `isEngineActive: false`

**Current Behavior**:
- ✅ Properly updated on start/stop
- ✅ Mode-specific (paper vs live)
- ❌ **Does NOT trigger SystemConfig.passiveLearning update**

---

### 1.3 Derived passiveLearning (Broadcast-Only)

**Location**: `server/services/trading-state-sync.ts` (line 443)

**Derivation Logic**:
```typescript
const isActive = (currentMode === 'paper' ? isEngineActivePaper : isEngineActiveLive);
const passiveLearning = !isActive;
```

**Usage**:
- Included in `trading_state_changed` WebSocket broadcasts (line 503)
- Included in broadcast payload for UI updates
- **NOT persisted to database**
- **NOT written to SystemConfig**

**Current Behavior**:
- ✅ Correctly derived from engine state
- ✅ Matches truth spec formula: `!tradingActive`
- ✅ Debounced to prevent duplicate broadcasts
- ❌ **NOT persisted - only exists in broadcasts**
- ❌ **Does NOT update SystemConfig.passiveLearning**

---

## Section 2: How Passive Learning is Set/Flipped (Current State)

### 2.1 Automatic Derivation (Broadcast-Only)

**Call Site**: `trading-state-sync.ts::broadcastUserUpdate()` (line 443)

**Trigger Points**:
- Called from `/api/trading/start` endpoint (routes.ts, line 2534)
- Called from `/api/trading/stop` endpoint (routes.ts, line 2641)
- Called on system reconciliation

**Flow**:
```
User clicks Start/Stop
  ↓
routes.ts: /trading/start or /trading/stop
  ↓
storage.updateSystemContext({ isEngineActive: true|false })
  ↓
tradingStateSync.broadcastUserUpdate(userId)
  ↓
Derives: passiveLearning = !isActive
  ↓
Broadcasts to WebSocket clients
  ↓
❌ SystemConfig.passiveLearning NOT updated
```

**Gap**: Derivation exists but doesn't persist to config.

---

### 2.2 Manual Updates (Admin-Only)

**Call Site**: `system-config.ts::updateConfig()` (line 88)

**Current Callers**:
- Admin API endpoints (if any)
- System initialization (sets default `true`)
- **NO automatic calls from trading state changes**

**Update Pattern**:
```typescript
await systemConfigService.getInstance().updateConfig(
  { passiveLearning: true|false },
  'admin'
);
```

**Gap**: Manual updates exist but no automatic sync mechanism.

---

## Section 3: Broadcast & UI (Current State)

### 3.1 WebSocket Broadcasts

**Events Including passiveLearning**:

1. **trading_state_changed** (trading-state-sync.ts, line 507):
```typescript
await contextBridge.broadcast({
  type: 'trading_state_changed',
  payload: {
    ...
    passiveLearning // Derived from !isActive
  },
  mode: currentMode
});
```

2. **trading_state_ack** (similar pattern)

**Current Behavior**:
- ✅ Broadcasts include `passiveLearning` field
- ✅ Value matches derived logic (`!isActive`)
- ✅ All WebSocket clients receive updates
- ⚠️ **Broadcast value ≠ SystemConfig value** (inconsistency)

---

### 3.2 Frontend Reads

**TradingModeContext**: 
- Receives `passiveLearning` from WebSocket broadcasts
- Updates client-side state

**TopBar Component** (`client/src/components/layout/top-bar.tsx`):
- Reads `passiveLearning` from context
- Shows/hides passive learning indicator

**Filter Insights** (`client/src/components/trading/filter-insights.tsx`):
- Shows "Passive Learning" banner when `passiveLearning === true`
- Hides banner when `passiveLearning === false`

**Current Behavior**:
- ✅ UI correctly responds to broadcast `passiveLearning` value
- ✅ Banner appears when engine STOPPED
- ✅ Banner hides when engine ACTIVE
- ⚠️ **UI shows broadcast value, not SystemConfig value**

---

## Section 4: Gating Checks (Current State)

### 4.1 FX5 Scanner (Active Pool Population)

**Location**: `server/services/fx5-scanner.ts` (lines 180-193)

**Gate Pattern** (REB 2.6 implementation):
```typescript
// Guard 1: Check persistent config flag
const isPassiveLearning = systemConfigService.isPassiveLearningEnabled();

// Guard 2: Enforce passive mode (clear pool if engine stopped)
activeFilterPool.enforcePassiveModeIfStopped(mode, isEngineActive);

// Guard 3: Only populate if BOTH conditions met
if (isEngineActive && !isPassiveLearning) {
  // Add survivors to Active Filter Pool
  const poolStats = activeFilterPool.addSurvivors(mode, survivors);
} else if (isPassiveLearning) {
  console.log(`[8.6.9][PassivePool] Passive learning enabled - Active Pool not populated`);
}
```

**Current Behavior**:
- ✅ **Dual-gate pattern correctly implemented**
- ✅ Checks `SystemConfig.passiveLearning` FIRST
- ✅ Checks `isEngineActive` SECOND
- ✅ Logs passive mode skips
- ⚠️ **BUT SystemConfig.passiveLearning may be stale!**

**Impact of Stale Config**:
- If `SystemConfig.passiveLearning = true` (stale) but engine is ACTIVE:
  - Pool will NOT populate (incorrect!)
  - Logs will show passive mode (misleading!)

---

### 4.2 24h Window Tracking

**Location**: `server/services/fx5-scanner.ts` (lines 242, 245)

**Current Gates**:
```typescript
// Track cycles per hour (ONLY when engine is ACTIVE)
recordScanCompletion(mode, isEngineActive);

// Track 24h metrics (ONLY when engine is ACTIVE)
recordScanFor24h(mode, { ... }, isEngineActive);
```

**Gate Implementation** (`server/services/fx5-24h-window.ts`):
- Checks `isEngineActive` parameter
- **Does NOT check SystemConfig.passiveLearning**

**Current Behavior**:
- ✅ Gates by engine state
- ❌ **Does NOT check SystemConfig.passiveLearning**
- ❌ **Missing dual-gate pattern** (REB 2.6 violation)

**Gap**: 24h tracking should have same dual-gate as Active Pool.

---

### 4.3 Active Filter Pool Enforcement

**Location**: `server/services/active-filter-pool.ts` (line 215)

**Method**:
```typescript
enforcePassiveModeIfStopped(mode: 'paper' | 'live', isEngineRunning: boolean): void {
  if (!isEngineRunning) {
    const pool = this.getPool(mode);
    if (pool.size > 0) {
      console.log(`[8.6.7][DEBUG] Engine stopped for ${mode} - clearing Active Pool`);
      this.clearPool(mode);
    }
  }
}
```

**Call Sites**:
- `fx5-scanner.ts` (line 183) - called every scan
- **Expected but MISSING**: stop endpoints in routes.ts

**Current Behavior**:
- ✅ Clears pool when `!isEngineRunning`
- ✅ Called from FX5 scanner
- ❌ **NOT called from /trading/stop endpoints**
- ❌ **Should be called when engine stops for immediate pool clear**

---

## Section 5: Gap Analysis vs Truth Spec

### Truth Requirement #1: Derived passiveLearning
**Spec**: `const isPassiveLearning = !tradingActive;`

**Current State**:
- ✅ Derived correctly in `trading-state-sync.ts`
- ❌ **NOT persisted to SystemConfig**
- ❌ **Broadcast value ≠ SystemConfig value**

**Gap**: Need to persist derived value to `SystemConfig.passiveLearning`.

---

### Truth Requirement #2: Automatic Updates
**Spec**: passiveLearning updates automatically when trading starts/stops

**Current State**:
- ✅ Derived for broadcasts on every state change
- ❌ **SystemConfig.passiveLearning remains stale**
- ❌ **No automatic persistence**

**Gap**: Need to add `SystemConfig.updateConfig()` call after deriving value.

---

### Truth Requirement #3: Dual-Gate Pattern
**Spec**: All gating logic must check BOTH `SystemConfig.passiveLearning` AND `isEngineActive`

**Current State**:
- ✅ FX5 Scanner has dual gates (correct!)
- ❌ 24h Window Tracking only checks `isEngineActive`
- ❌ Missing `SystemConfig.passiveLearning` check in 24h module

**Gap**: Add `SystemConfig.passiveLearning` check to 24h tracking functions.

---

### Truth Requirement #4: enforcePassiveModeIfStopped() Calls
**Spec**: Must be called when engine transitions to STOPPED

**Current State**:
- ✅ Called from FX5 scanner every cycle
- ❌ **NOT called from /trading/stop endpoints**
- ❌ **Pool may not clear immediately on manual stop**

**Gap**: Add `enforcePassiveModeIfStopped()` call to stop endpoints.

---

## Section 6: Current Files & Dependencies

### Files Containing passiveLearning Logic

1. **server/services/system-config.ts**
   - `SystemConfigService` class
   - `passiveLearning` field + cache
   - `isPassiveLearningEnabled()` getter
   - `updateConfig()` setter

2. **server/services/trading-state-sync.ts**
   - `broadcastUserUpdate()` - derives `passiveLearning = !isActive`
   - Includes in WebSocket broadcasts

3. **server/services/fx5-scanner.ts**
   - Checks `systemConfigService.isPassiveLearningEnabled()`
   - Dual-gate pattern for Active Pool
   - Calls `enforcePassiveModeIfStopped()`

4. **server/services/active-filter-pool.ts**
   - `enforcePassiveModeIfStopped()` method
   - Clears pool when engine stopped

5. **server/services/fx5-24h-window.ts**
   - `recordScanCompletion()` - gates by `isEngineActive`
   - `recordScanFor24h()` - gates by `isEngineActive`
   - **Missing SystemConfig.passiveLearning checks**

6. **server/routes.ts**
   - `/api/trading/start` - sets `isEngineActive: true`
   - `/api/trading/stop` - sets `isEngineActive: false`
   - Calls `tradingStateSync.broadcastUserUpdate()`
   - **Missing enforcePassiveModeIfStopped() calls**

7. **client/src/components/layout/top-bar.tsx**
   - Reads `passiveLearning` from context
   - Shows/hides UI indicator

8. **client/src/components/trading/filter-insights.tsx**
   - Shows "Passive Learning" banner based on `passiveLearning`

---

## Section 7: Summary of Gaps

### Critical Gaps (Must Fix)

1. **SystemConfig Auto-Update Missing**
   - Derived `passiveLearning` value NOT written to SystemConfig
   - Causes inconsistency between broadcasts and behavioral gates
   - **Fix**: Add `systemConfigService.updateConfig()` in `broadcastUserUpdate()`

2. **24h Window Missing Dual-Gate**
   - `recordScanFor24h()` only checks `isEngineActive`
   - Does NOT check `SystemConfig.passiveLearning`
   - **Fix**: Add dual-gate pattern in `fx5-24h-window.ts`

3. **Missing enforcePassiveModeIfStopped() Calls**
   - Stop endpoints don't call `enforcePassiveModeIfStopped()`
   - Pool may not clear immediately on manual stop
   - **Fix**: Add calls to `/trading/stop` endpoints

### Minor Gaps (Nice to Have)

4. **Logging Consistency**
   - Some logs use `[8.6.9][PassivePool]`, others don't
   - **Fix**: Standardize logging prefixes

---

## Section 8: Next Steps (Implementation Plan)

After this mapping is complete, REB 2.8.6 will:

1. **Task A.2**: Restore automatic passiveLearning persistence
   - Add `systemConfigService.updateConfig()` call in `broadcastUserUpdate()`
   - Ensure SystemConfig.passiveLearning syncs with trading state

2. **Task B.2**: Complete dual-gate wiring
   - Add SystemConfig.passiveLearning checks to `recordScanFor24h()`
   - Add `enforcePassiveModeIfStopped()` calls to stop endpoints

3. **Task C**: Verify with logs and testing
   - Confirm state transitions work correctly
   - Verify Active Pool clears when passive
   - Verify metrics skip when passive

---

**Document Version**: 1.0 (Current State Snapshot)  
**Last Updated**: November 25, 2025  
**Status**: READ-ONLY MAPPING (Before Implementation)

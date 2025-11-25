# REB 2.8.6B: Passive Learning and Active Pool Mapping (MAPPING)

**Date**: 2025-11-25  
**Status**: ✅ COMPLETED  
**Session**: REB 2.8.6B

---

## I. ISSUE SUMMARY

### Problem Statement
Three architectural issues with passive learning and active pool:
1. **SystemConfig.passiveLearning** was persisted to database, creating false source of truth
2. **FX5-24h-window.ts** checked both `SystemConfig.passiveLearning` AND `isEngineActive`, violating single-gate pattern
3. **UI Passive Learning Indicator** read from SystemConfig instead of trading status (derived value)

### Passive Learning Definition
**Passive Learning** = Engine is STOPPED (`!isEngineActive`)
- NOT a stored flag
- NOT a separate system mode
- DERIVED automatically from engine state
- When stopped: FX5 skips metrics recording, Active Pool clears

---

## II. ARCHITECTURE TRUTH

### 2.1 Single Source of Truth: isEngineActive
```typescript
// ✅ TRUTH: Engine state determines passive learning
isEngineActive = isEngineActivePaper || isEngineActiveLive

// ✅ DERIVED: Passive learning is computed, not stored
passiveLearning = !isEngineActive
```

### 2.2 Single-Gate Pattern
```typescript
// ✅ CORRECT: Check ONLY isEngineActive
if (!isEngineActive) {
  console.log('[FX5-24h] Skipped - engine STOPPED (passive learning)');
  return;
}

// ❌ WRONG: Checking SystemConfig creates false gates
if (SystemConfig.passiveLearning || !isEngineActive) {
  // BAD: Two sources of truth
}
```

---

## III. CHANGES IMPLEMENTED

### 3.1 Removed SystemConfig.passiveLearning Persistence
**File**: `server/services/trading-state-sync.ts`
```typescript
// ❌ REMOVED: No longer persisting passiveLearning
await db.update(systemConfigs).set({ 
  passiveLearning: derivedPassiveLearning  // REMOVED
});

// ✅ NEW: Derive only, never persist
const passiveLearning = !paperActive && !liveActive;
console.log(`[REB 2.8.6B][PassiveLearning] Derived (not persisted): passiveLearning=${passiveLearning}`);
```

### 3.2 Fixed FX5-24h-Window Single-Gate Pattern
**File**: `server/services/fx5-24h-window.ts`
```typescript
// ❌ REMOVED: No longer checking SystemConfig
const systemConfig = await getSystemConfig();
if (systemConfig.systemFlags.passiveLearning) {
  // REMOVED
}

// ✅ NEW: Check ONLY isEngineActive parameter
if (!isEngineActive) {
  console.log(`[FX5-24h] Skipped recording ${mode} cycle ${cycleId} - engine STOPPED (passive learning)`);
  return;
}
```

### 3.3 Fixed UI Passive Learning Indicator
**File**: `client/src/components/layout/top-bar.tsx`
```tsx
// ❌ REMOVED: Reading from SystemConfig (false source)
{systemConfigData?.systemFlags?.passiveLearning && (
  <div>PASSIVE LEARNING</div>
)}

// ✅ NEW: Use derived value from tradingStatus
{tradingStatus?.passiveLearning && (
  <div>PASSIVE LEARNING</div>
)}
```

---

## IV. DATA FLOW MAPPING

### 4.1 Engine State → Passive Learning
```
┌─────────────────────────────────────────────────────────────┐
│ Engine State (Truth)                                        │
├─────────────────────────────────────────────────────────────┤
│ isEngineActivePaper: boolean  (DB: SystemContext)           │
│ isEngineActiveLive:  boolean  (DB: SystemContext)           │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
         ┌───────────────┐
         │ isEngineActive│ = isEngineActivePaper || isEngineActiveLive
         └───────┬───────┘
                 │
                 ▼
         ┌───────────────┐
         │passiveLearning│ = !isEngineActive
         └───────┬───────┘
                 │
    ─────────────┴─────────────
    │                         │
    ▼                         ▼
┌───────────┐           ┌──────────────┐
│FX5 Metrics│           │Active Pool   │
│Skip Logic │           │Clear Logic   │
└───────────┘           └──────────────┘
```

### 4.2 FX5 Metrics Flow
```typescript
recordCycleToWindow(cycleId, mode, isEngineActive) {
  // Gate 1: Check engine state (ONLY gate)
  if (!isEngineActive) {
    console.log('[FX5-24h] Skipped - engine STOPPED (passive learning)');
    return; // EXIT: No metrics recorded
  }
  
  // Gate passed: Record metrics to DB
  await db.insert(fx5Cycles).values({...});
  console.log('[FX5-24h] Recorded cycle');
}
```

### 4.3 Active Pool Flow
```typescript
enforcePassiveModeIfStopped(isEngineActive) {
  if (!isEngineActive) {
    // Clear pool: passive learning means no active filters
    await db.delete(activeFilterPool).where(...);
    console.log('[ActivePool] Cleared for passive learning');
  }
}
```

### 4.4 Trading Status Broadcast
```typescript
// Server: Compute and broadcast
const passiveLearning = !isEngineActivePaper && !isEngineActiveLive;
websocket.broadcast('trading_state_changed', {
  passiveLearning,  // Derived value
  isEngineActive: isEngineActivePaper || isEngineActiveLive
});

// Client: Receive and display
tradingStatus.passiveLearning  // Use this for UI
```

---

## V. VERIFICATION POINTS

### 5.1 Server Logs (Startup)
```
[REB 2.8.6B][PassiveLearning] Derived (not persisted): passiveLearning= true paperActive= false liveActive= false
```

### 5.2 FX5 Metrics Logs (During Scan)
```
[FX5-24h] Skipped recording live cycle cycle_live_FEr3yw51ygkY - engine STOPPED (passive learning)
[FX5-24h] Skipped recording paper cycle cycle_paper_LgdqyrgjZRNi - engine STOPPED (passive learning)
```

### 5.3 Browser Console (UI)
```javascript
[DEBUG][TopBar] {
  "mode": "paper",
  "active": false,
  "isTradingActive": false,
  "passiveLearning": true  // ✅ Derived value displayed
}
```

---

## VI. FILES MODIFIED

| File | Changes |
|------|---------|
| `server/services/trading-state-sync.ts` | Removed passiveLearning persistence, made derived-only |
| `server/services/fx5-24h-window.ts` | Removed SystemConfig check, use ONLY isEngineActive |
| `server/services/active-filter-pool.ts` | Already correct (uses isEngineActive param) |
| `client/src/components/layout/top-bar.tsx` | Changed to use tradingStatus.passiveLearning |

---

## VII. PATTERN COMPLIANCE

### ✅ Truth Constraints Met
1. **SystemContext** = Single source of truth for engine state
2. **isEngineActive** = Single gate for all passive learning decisions
3. **passiveLearning** = Derived value, never persisted
4. **Single-gate pattern** = Check ONLY isEngineActive, not multiple flags

### ✅ Data Flow Verified
1. Engine state changes → SystemContext update
2. SystemContext → isEngineActive computation
3. isEngineActive → passiveLearning derivation
4. passiveLearning → FX5 metrics skip + Active Pool clear

### ✅ No Persistence
- SystemConfig.passiveLearning removed from DB writes
- Passive learning computed on every request
- No stale state possible

---

## VIII. NEXT STEPS

Continue to REB_2.8.6B_PASSIVE_LEARNING_AND_ACTIVE_POOL_COMPLETION.md for:
- Testing results
- Architect review
- Final verification
- Session closure

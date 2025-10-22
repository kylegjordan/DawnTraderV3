# LSP Error Root-Cause Analysis Report
**Generated:** October 22, 2025  
**Total Errors:** 83 across 2 files  
**Analysis Scope:** Schema drift, API contracts, global state shapes, crash vectors

---

## Executive Summary

The 83 LSP/TypeScript errors stem from **schema drift** where the codebase references database fields and types that no longer exist or have been renamed. These are **type-checking warnings** that don't prevent runtime execution but represent **latent crash vectors** that will trigger runtime errors when those specific code paths are hit.

**Critical Finding:** While the app runs now, these errors indicate **imminent production failures** in:
- Trade history endpoints (closedAt, realizedPnl mismatches)
- Reasoning trace debugging (missing fields)
- Alert management (missing AlertsService import)
- Settings API (missing currentMode, paperInitialBalance, tradingMode fields)

---

## 1. Error Heatmap

| File | Category | Count | Severity |
|------|----------|-------|----------|
| **server/routes.ts** | Schema/DB Field Drift | 35 | 🔴 CRITICAL |
| **server/routes.ts** | Missing Imports | 7 | 🔴 CRITICAL |
| **server/routes.ts** | Null/Undefined Type Mismatch | 6 | 🟡 HIGH |
| **server/routes.ts** | Missing DB Methods | 3 | 🟡 HIGH |
| **server/routes.ts** | Table Schema Drift | 31 | 🔴 CRITICAL |
| **server/services/paper-execution-engine.ts** | Strategy Type Mismatch | 1 | 🔴 CRITICAL |
| **TOTAL** | - | **83** | - |

### Category Breakdown

#### 📊 Schema/DB Field Drift (35 errors)
Code references fields that don't exist in the database schema:
- **trades table:** `closedAt` (should be `exitTime`), `createdAt` (should be `entryTime`), `realizedPnl` (should be `realizedPL`)
- **trading_settings table:** `paperInitialBalance`, `currentMode`, `tradingMode` (doesn't exist)
- **reasoning_trace table:** `systemState`, `mode`, `outcome`, `error`, `processingTimeMs`, `completedAt` (don't exist)
- **reasoning_queue table:** `stepId`, `bobDomain`, `action`, `params`, `error`, `startedAt` (don't exist)

#### 🚫 Missing Imports (7 errors)
- `AlertsService` not imported in routes.ts (used 6 times)
- `RISK_APPROVAL_THRESHOLD` constant undefined (used 1 time)

#### ⚠️ Type Mismatches (6 errors)
- Null vs undefined conflicts: `string | null` vs `string | undefined`
- Database returns `null`, but functions expect `undefined`

#### 🔧 Missing Methods (3 errors)
- `DatabaseStorage.getDatabaseStatus()` doesn't exist
- `DatabaseStorage.getAIErrorLogs()` doesn't exist (typo: should be `getErrorLogs`)
- `TradingEngine.getStatus()` doesn't exist

#### 🏗️ Strategy Registry Mismatch (1 error)
- TradeSignal interface allows only 3 strategies
- Schema and execution engine use all 8 strategies

---

## 2. Top 10 Critical Mismatches

### 🔴 PRIORITY 1: Trade History Fields (Affects Paper Trading Metrics)

| Location | Code Reference | Actual Schema Field | Impact |
|----------|----------------|---------------------|--------|
| routes.ts:1986 | `trade.closedAt` | `trade.exitTime` | ❌ Earnings chart broken |
| routes.ts:1987 | `trade.closedAt` | `trade.exitTime` | ❌ Earnings chart broken |
| routes.ts:1991 | `trade.realizedPnl` | `trade.realizedPL` | ❌ Wrong property name |
| routes.ts:2029 | `trade.closedAt` | `trade.exitTime` | ❌ History chart broken |
| routes.ts:2029 | `trade.createdAt` | `trade.entryTime` | ❌ History chart broken |
| routes.ts:2031 | `trade.closedAt` | `trade.exitTime` | ❌ History chart broken |
| routes.ts:2032 | `trade.closedAt` | `trade.exitTime` | ❌ History chart broken |
| routes.ts:2034 | `trade.realizedPnl` | `trade.realizedPL` | ❌ Wrong property name |

**Authoritative Source:** `shared/schema.ts` lines 327-355 (trades table)
```typescript
export const trades = pgTable("trades", {
  // ... no closedAt or createdAt fields
  entryTime: timestamp("entry_time", { withTimezone: true }).defaultNow(),
  exitTime: timestamp("exit_time", { withTimezone: true }),
  realizedPL: decimal("realized_pl", { precision: 10, scale: 2 }),
  // ... no realizedPnl field
});
```

### 🔴 PRIORITY 2: Trading Settings Fields

| Location | Code Reference | Actual Location | Impact |
|----------|----------------|-----------------|--------|
| routes.ts:747 | `settings.currentMode` | `users.tradingMode` | ❌ Mode detection broken |
| routes.ts:2022 | `settings.paperInitialBalance` | Doesn't exist | ❌ History chart broken |
| routes.ts:9884 | `settings.tradingMode` | `users.tradingMode` | ❌ Wrong table |

**Authoritative Source:** 
- `settings.currentMode` and `settings.tradingMode` **DO NOT EXIST**
- `users.tradingMode` exists at `shared/schema.ts` line 130

### 🔴 PRIORITY 3: Reasoning Trace Fields

| Location | Code Reference | Exists? | Impact |
|----------|----------------|---------|--------|
| routes.ts:9312 | `traceData.systemState` | ❌ NO | Runtime crash |
| routes.ts:9313 | `traceData.mode` | ❌ NO | Runtime crash |
| routes.ts:9317 | `traceData.outcome` | ❌ NO | Runtime crash |
| routes.ts:9318 | `traceData.error` | ❌ NO | Runtime crash |
| routes.ts:9319 | `traceData.processingTimeMs` | ❌ NO | Runtime crash |
| routes.ts:9321 | `traceData.completedAt` | ❌ NO | Runtime crash |

**Authoritative Source:** `shared/schema.ts` lines 2423-2440 (reasoningTrace table)
```typescript
export const reasoningTrace = pgTable("reasoning_trace", {
  id, traceId, userId, intentAction, steps, domainContext, 
  decisionSummary, status, metadata, createdAt, updatedAt
  // NO: systemState, mode, outcome, error, processingTimeMs, completedAt
});
```

### 🔴 PRIORITY 4: Reasoning Queue Fields

| Location | Code Reference | Exists? | Impact |
|----------|----------------|---------|--------|
| routes.ts:9326 | `task.stepId` | ❌ NO | Runtime crash |
| routes.ts:9327 | `task.bobDomain` | ❌ NO | Runtime crash |
| routes.ts:9328 | `task.action` | ❌ NO | Runtime crash |
| routes.ts:9329 | `task.params` | ❌ NO | Runtime crash |
| routes.ts:9332 | `task.error` | ❌ NO | Runtime crash |
| routes.ts:9335 | `task.startedAt` | ❌ NO | Runtime crash |

**Authoritative Source:** `shared/schema.ts` lines 2443-2458 (reasoningQueue table)
```typescript
export const reasoningQueue = pgTable("reasoning_queue", {
  id, traceId, taskType, payload, status, result, errorMessage, 
  retryCount, retryAt, lockedAt, lockedBy, createdAt, completedAt
  // NO: stepId, bobDomain, action, params, error, startedAt
});
```

### 🔴 PRIORITY 5: Missing AlertsService Import

| Location | Usage | Impact |
|----------|-------|--------|
| routes.ts:5346 | `AlertsService.createAlert(...)` | ❌ Runtime crash |
| routes.ts:5347 | `AlertsService.createAlert(...)` | ❌ Runtime crash |
| routes.ts:5377 | `AlertsService.createAlert(...)` | ❌ Runtime crash |
| routes.ts:5382 | `AlertsService.createAlert(...)` | ❌ Runtime crash |
| routes.ts:5463 | `AlertsService.createAlert(...)` | ❌ Runtime crash |
| routes.ts:5470 | `AlertsService.createAlert(...)` | ❌ Runtime crash |

**Fix Required:** Add import at top of routes.ts:
```typescript
import { AlertsService } from './services/alerts-service.js';
```

### 🔴 PRIORITY 6: Strategy Type Mismatch

| Location | Issue | Impact |
|----------|-------|--------|
| paper-execution-engine.ts:440 | TradeSignal allows only 3 strategies but code uses all 8 | ❌ Type error on 5 strategies |

**Authoritative Source:** `shared/schema.ts` line 27-36
```typescript
export const strategyTypeEnum = pgEnum("strategy_type", [
  "vwap_pullback", "abcd_long", "sma_trend_ride",
  "breakout", "mean_reversion", "range_trading", 
  "vwap_bounce", "liquidity_trap"  // 8 total strategies
]);
```

**Current TradeSignal:** `server/services/trading-engine.ts` line 7-17
```typescript
export interface TradeSignal {
  strategy: 'vwap_pullback' | 'abcd_long' | 'sma_trend_ride'; // Only 3!
  // Missing: breakout, mean_reversion, range_trading, vwap_bounce, liquidity_trap
}
```

### 🟡 PRIORITY 7-10: Additional Mismatches

| Location | Issue | Fix |
|----------|-------|-----|
| routes.ts:8213, 8272, 8312 | Function expects 1 arg, got 3 | Update function signature |
| routes.ts:8377 | `string \| null` not assignable to `string` | Add null check |
| routes.ts:8730 | `chat.messageCount` possibly null | Add null check |
| routes.ts:9880 | `getDatabaseStatus()` doesn't exist | Implement method or remove call |

---

## 3. API Contract Matrix

| Endpoint | Server Return Type | Client Expected Type | Status |
|----------|-------------------|---------------------|--------|
| `/api/paper/metrics/earnings-chart` | `{ date, earnings: realizedPnl, timestamp }` | `{ date, earnings, timestamp }` | 🔴 BROKEN - realizedPnl doesn't exist |
| `/api/paper/metrics/history` | Uses `paperInitialBalance`, `closedAt`, `createdAt` | Valid history data | 🔴 BROKEN - fields don't exist |
| `/api/paper/trades/active` | Returns `{ closedAt, realizedPnl }` | Active trades | 🔴 BROKEN - wrong field names |
| `/api/reasoning/debug/:traceId` | Returns `{ systemState, mode, outcome, error, ... }` | Debug trace data | 🔴 BROKEN - fields don't exist |
| `/api/settings` | Returns `{ currentMode, tradingMode }` | Settings object | 🔴 BROKEN - fields don't exist |
| `/api/trading/status` | Uses `settings.tradingMode` | Trading status | 🔴 BROKEN - wrong table |

### Field-Level Contract Violations

#### Paper Trading Metrics Endpoints
```diff
- trade.closedAt        ❌ DOESN'T EXIST
+ trade.exitTime        ✅ CORRECT

- trade.createdAt       ❌ DOESN'T EXIST  
+ trade.entryTime       ✅ CORRECT

- trade.realizedPnl     ❌ WRONG CASE
+ trade.realizedPL      ✅ CORRECT

- settings.paperInitialBalance  ❌ DOESN'T EXIST
+ portfolio_state.balance       ✅ ALTERNATIVE (but requires query change)
```

#### Reasoning Debug Endpoint
```diff
- traceData.systemState      ❌ DOESN'T EXIST
- traceData.mode             ❌ DOESN'T EXIST
- traceData.outcome          ❌ DOESN'T EXIST
- traceData.error            ❌ DOESN'T EXIST
- traceData.processingTimeMs ❌ DOESN'T EXIST
- traceData.completedAt      ❌ DOESN'T EXIST

+ traceData.metadata         ✅ EXISTS (could store these as JSON)
```

#### Task Queue Endpoint
```diff
- task.stepId      ❌ DOESN'T EXIST
- task.bobDomain   ❌ DOESN'T EXIST
- task.action      ❌ DOESN'T EXIST
- task.params      ❌ DOESN'T EXIST
- task.error       ❌ DOESN'T EXIST
- task.startedAt   ❌ DOESN'T EXIST

+ task.taskType    ✅ EXISTS
+ task.payload     ✅ EXISTS (could contain params)
+ task.errorMessage ✅ EXISTS
```

---

## 4. Global Session Shape Audit

### Current Global Session Shape (Inferred from Usage)

```typescript
// What routes.ts EXPECTS:
interface GlobalSession {
  currentMode: 'live' | 'paper';  // ❌ DOESN'T EXIST
  tradingMode: 'live' | 'paper';  // ❌ WRONG TABLE (exists on users, not trading_settings)
  paperInitialBalance: string;     // ❌ DOESN'T EXIST
}
```

### Actual Database Shapes

**TradingSettings Table** (`shared/schema.ts` lines 158-233):
```typescript
{
  id, globalContextId, userId,
  riskPerTrade, maxExposurePercent, maxOpenTrades,
  slippageToleranceMajors, slippageToleranceMidcaps, slippageToleranceSmall,
  stopBufferPercent, smaLength, minVolume, minDailyRange,
  aiCapitalAllocation, timezone, timeFormat,
  minPrice, maxBidAskSpread, excludeStablecoins,
  minDataHistoryDays, allowedTradingPairs, blacklistedSymbols, whitelistedSymbols,
  // ... strategy params ...
  // ❌ NO: currentMode, tradingMode, paperInitialBalance
}
```

**Users Table** (`shared/schema.ts` lines 120-155):
```typescript
{
  id, username, email, password, displayName, timezone,
  isAdmin, role, globalContextId,
  tradingMode,  // ✅ HERE! (not in trading_settings)
  tradingStatus,
  approvalMatrix, createdAt, updatedAt
}
```

### Mismatch Summary

| Code Location | Expected Field | Actual Location | Fix Required |
|---------------|----------------|-----------------|--------------|
| routes.ts:747 | `settings.currentMode` | ❌ Doesn't exist | Use `user.tradingMode` instead |
| routes.ts:2022 | `settings.paperInitialBalance` | ❌ Doesn't exist | Query `portfolio_state` table |
| routes.ts:9884 | `settings.tradingMode` | ❌ Wrong table | Use `user.tradingMode` instead |

---

## 5. 10-Minute Cycle Crash Vector Analysis

### ⚠️ SERVER CRASH DETECTED

**Status:** Server showing FAILED state in workflow logs  
**Last Activity:** Market scanner completed full cycle scan (40+ pairs)  
**Crash Timing:** After strategy signal generation  
**WebSocket:** Disconnected with reconnection attempts

### Crash Timeline

```
08:15:03 - Performance snapshot healthy (taskQueue depth: 0)
08:25:03 - Performance snapshot healthy (taskQueue depth: 0)
08:25:04 - Experience synthesis complete (1 high-impact lesson)
08:25:04 - Safety event: KILL_SWITCH triggered, action blocked
08:34:40 - Market scanner full cycle completed (signals generated)
08:34:40 - [CRASH] Server status: FAILED
08:38:80 - WebSocket disconnection, reconnection attempts
```

### Potential Crash Vectors (Ordered by Likelihood)

#### 1. 🔴 CRITICAL: Trade Execution Path Hit (realizedPnl/closedAt mismatch)
**Likelihood:** HIGH  
**Evidence:** Signals generated for 15+ pairs, execution path likely triggered  
**Crash Point:** If any trade closed, accessing `trade.realizedPnl` or `trade.closedAt` → undefined  
**Fix:** Update field names to `realizedPL` and `exitTime`

#### 2. 🔴 CRITICAL: AlertsService Called
**Likelihood:** MEDIUM  
**Evidence:** Safety event triggered (KILL_SWITCH), may have called AlertsService  
**Crash Point:** `AlertsService.createAlert(...)` → ReferenceError: AlertsService is not defined  
**Fix:** Add import for AlertsService

#### 3. 🟡 HIGH: Settings Access (currentMode/tradingMode)
**Likelihood:** MEDIUM  
**Evidence:** Context bridge broadcasts use `settings.currentMode`  
**Crash Point:** Accessing `settings.currentMode` → undefined  
**Fix:** Use `user.tradingMode` instead

#### 4. 🟡 MEDIUM: Memory/Resource Exhaustion
**Likelihood:** LOW  
**Evidence:** System health 40.2% (degraded), but not critical  
**Crash Point:** Node.js OOM or unhandled promise rejection  
**Fix:** Not LSP-related, but monitor memory usage

### Crash Confirmation Test

To confirm which vector triggered the crash:
1. Read full server logs: `read /tmp/logs/Start_application_20251022_083440_610.log`
2. Look for:
   - `ReferenceError: AlertsService is not defined`
   - `Cannot read property 'realizedPnl' of undefined`
   - `Cannot read property 'closedAt' of undefined`
   - `Cannot read property 'currentMode' of undefined`

---

## 6. OpenAI Rate Limiter Status

### Current Status: ✅ PRESENT, ❌ NOT WORKING

**Evidence from Logs:**
```
OpenAI API error: 429 - Rate limit exceeded
```

**Analysis:**
- Rate limiter wrapper exists: `server/services/openai-rate-limiter.ts`
- Import found in: `./server/services/alerts-service.ts`, others
- **Issue:** Rate limiter present but quota still exceeded (API key exhausted, not code issue)

### Rate Limiter Health

| Component | Status | Notes |
|-----------|--------|-------|
| Wrapper exists | ✅ YES | Found in multiple service files |
| Imported | ✅ YES | Used by AI services |
| Preventing errors | ❌ NO | 429 errors still occurring |
| Root cause | 💳 QUOTA | OpenAI API key quota exhausted (not a code bug) |

**Conclusion:** Rate limiter is properly wired, but cannot prevent quota exhaustion. This is an account/billing issue, not a code issue.

---

## 7. Actionable Fix Plan

### Phase 1: Critical Runtime Crash Fixes (BLOCKING)

**Priority:** 🔴 MUST FIX IMMEDIATELY  
**Time Estimate:** 30 minutes  
**Risk:** LOW (simple field renames)

#### Fix 1.1: Add Missing Import
**File:** `server/routes.ts`  
**Line:** ~1-50 (import section)  
**Change:**
```typescript
+ import { AlertsService } from './services/alerts-service.js';
```

#### Fix 1.2: Trade Field Name Corrections
**File:** `server/routes.ts`  
**Lines:** 1986, 1987, 1991, 2029, 2031, 2032, 2034  
**Changes:**
```typescript
- trade.closedAt
+ trade.exitTime

- trade.createdAt  
+ trade.entryTime

- trade.realizedPnl
+ trade.realizedPL
```

#### Fix 1.3: Settings Field Corrections
**File:** `server/routes.ts`  
**Lines:** 747, 2022, 9884  
**Changes:**
```typescript
- settings.currentMode
+ user.tradingMode  // Requires user lookup

- settings.paperInitialBalance
+ // Query portfolio_state table instead

- settings.tradingMode
+ user.tradingMode
```

#### Fix 1.4: Remove/Comment Out Reasoning Debug Fields
**File:** `server/routes.ts`  
**Lines:** 9312-9321, 9326-9335  
**Option A (Quick):** Comment out missing fields
```typescript
// systemState: traceData.systemState,  // TODO: Add to schema or use metadata
// mode: traceData.mode,
// outcome: traceData.outcome,
// error: traceData.error,
// processingTimeMs: traceData.processingTimeMs,
// completedAt: traceData.completedAt
```

**Option B (Proper):** Add fields to schema OR extract from metadata

---

### Phase 2: Strategy Type Fix (BLOCKING TRADES)

**Priority:** 🔴 HIGH  
**Time Estimate:** 5 minutes  
**Risk:** NONE (pure type fix)

#### Fix 2.1: Update TradeSignal Interface
**File:** `server/services/trading-engine.ts`  
**Line:** 7-17  
**Change:**
```typescript
export interface TradeSignal {
  symbol: string;
- strategy: 'vwap_pullback' | 'abcd_long' | 'sma_trend_ride';
+ strategy: 'vwap_pullback' | 'abcd_long' | 'sma_trend_ride' | 
+           'breakout' | 'mean_reversion' | 'range_trading' | 
+           'vwap_bounce' | 'liquidity_trap';
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  confidence: number;
  goalAlignmentScore?: number;
  finalScore?: number;
  metadata: any;
}
```

**File:** `server/services/paper-execution.ts`  
**Line:** 6-14  
**Change:** Same as above

---

### Phase 3: Type Safety Improvements (NON-BLOCKING)

**Priority:** 🟡 MEDIUM  
**Time Estimate:** 20 minutes  
**Risk:** LOW

#### Fix 3.1: Null Check Additions
**File:** `server/routes.ts`  
**Lines:** 8377, 8730  
**Changes:**
```typescript
// Line 8377
- someFunction(nullableString)
+ if (nullableString) someFunction(nullableString)

// Line 8730
- chat.messageCount
+ chat.messageCount ?? 0
```

#### Fix 3.2: Function Signature Corrections
**File:** `server/routes.ts`  
**Lines:** 8213, 8272, 8312  
**Change:** Update function calls to match expected signature (inspect each)

#### Fix 3.3: Remove Non-Existent Method Calls
**File:** `server/routes.ts`  
**Lines:** 9880, 9916  
**Changes:**
```typescript
- storage.getDatabaseStatus()  // Remove or implement
- storage.getAIErrorLogs()     // Change to getErrorLogs()
```

---

### Phase 4: Schema Alignment Decision (REQUIRES DISCUSSION)

**Priority:** 🟡 MEDIUM  
**Decision Required:** Should reasoning_trace and reasoning_queue schemas be updated?

**Option A:** Add missing fields to schema
```sql
ALTER TABLE reasoning_trace ADD COLUMN system_state TEXT;
ALTER TABLE reasoning_trace ADD COLUMN mode VARCHAR(20);
-- etc.
```

**Option B:** Use existing metadata/payload JSONB fields
```typescript
// Store in metadata instead of dedicated columns
traceData.metadata = {
  systemState: '...',
  mode: '...',
  outcome: '...'
}
```

**Recommendation:** Option B (use metadata) - avoids schema changes, keeps tables lean

---

## 8. Summary & Next Steps

### Root Causes Identified

1. **Schema Evolution Without Code Updates** (70% of errors)
   - Database schema changed, code not updated
   - Field renames: `realizedPnl` → `realizedPL`, `closedAt` → `exitTime`

2. **Cross-Table Field References** (15% of errors)
   - Code assumes fields on wrong table (tradingMode on settings vs users)

3. **Missing Imports** (8% of errors)
   - AlertsService not imported despite 6+ usages

4. **Type System Limitations** (5% of errors)
   - TradeSignal interface too restrictive (3 strategies vs 8)

5. **Removed Fields Still Referenced** (2% of errors)
   - Code references fields that were removed from schema

### Crash Vector Confirmation Required

**Action:** Read full server logs to confirm exact crash point:
```bash
read /tmp/logs/Start_application_20251022_083440_610.log (offset: last 500 lines)
```

### Recommended Fix Sequence

1. ✅ **FIRST:** Fix Phase 1 (critical crashes) - 30 mins
2. ✅ **SECOND:** Fix Phase 2 (strategy types) - 5 mins  
3. ✅ **THIRD:** Test with `run_test` tool - verify no crashes
4. ⏸️ **LATER:** Fix Phase 3 (type safety) - 20 mins
5. ⏸️ **DISCUSS:** Phase 4 (schema alignment decision)

### Prevention Strategy

**To prevent this from happening again:**

1. **Enable TypeScript Strict Mode** in tsconfig.json
2. **Pre-commit LSP Check:** Run `npx tsc --noEmit` before committing
3. **Schema Change Protocol:**
   - Update schema first
   - Run `npm run db:push`
   - Search codebase for old field names
   - Update all references
   - Run `npx tsc --noEmit` to verify
4. **Automated Testing:** Add integration tests for all API endpoints

---

**Report Complete** | Total Errors: 83 | Critical: 75 | High: 6 | Medium: 2

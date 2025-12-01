# Phase 8.8.3-I — RTB (Ready-To-Buy) Lifecycle Audit

**Date**: December 1, 2025  
**Phase**: REB 8.8.3-I  
**Auditor**: System

## Executive Summary

The Ready-To-Buy (RTB) pool has been audited for alignment with the DawnTrader future-state architecture. Several gaps were identified that must be addressed to ensure proper signal lifecycle management.

## Current Implementation Analysis

### 1. Schema (`shared/schema.ts`)

**Status**: ✅ Adequate

```typescript
export const tradingSignals = pgTable("trading_signals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  mode: tradingModeEnum("mode").notNull().default("paper"),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  strategy: strategyTypeEnum("strategy").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  detectedAt: timestamp("detected_at", { withTimezone: true }).defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  executedAt: timestamp("executed_at", { withTimezone: true }),
  ...
});
```

- Has proper `expiresAt` field for TTL enforcement
- Has `status` field for lifecycle tracking
- Indexed by mode+status, symbol+strategy

### 2. Storage Methods (`server/storage.ts`)

**Status**: ⚠️ Partially Aligned

| Method | Status | Notes |
|--------|--------|-------|
| `saveTradingSignal()` | ✅ | Has deduplication - deletes existing before insert |
| `getTradingSignals()` | ✅ | Purges expired on fetch, filters by expiresAt |
| `updateSignalStatus()` | ✅ | Updates signal status |
| `expireOldSignals()` | ✅ | Marks signals as expired |
| `clearAllSignals()` | ❌ | **MISSING** - No method to clear RTB on reset |

### 3. Signal Enqueue Pipeline (`server/services/paper-execution-engine.ts`)

**Status**: ⚠️ Critical Issues

**Line 618**: TTL is set to **15 minutes** instead of 30 seconds:
```typescript
const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now
```

**Issues Found:**
1. ❌ **Wrong TTL** - Should be 30 seconds (FX5 cycle), not 15 minutes
2. ❌ **No active trade check** - Signals are enqueued even if symbol has an active position
3. ❌ **No [8.8.3-I] logging tags** - Missing required prefixes
4. ❌ **No signal consumption** - Trade execution doesn't mark signal as consumed

### 4. Simulation Reset (`server/routes.ts`)

**Status**: ❌ Critical Gap

**Line 6597-6600**: Reset deletes trades, positions, and logs but **NOT signals**:
```typescript
await storage.deleteAllPaperSimTrades('paper');
await storage.deleteAllPaperSimOpenPositions('paper');
await storage.deleteAllPaperSimTradeLogs('paper');
// MISSING: await storage.deleteAllTradingSignals('paper');
```

### 5. API Endpoint (`/api/trading-signals`)

**Status**: ✅ Adequate

- Correctly calls `getTradingSignals()` with mode filter
- Has debug logging with [8.8.3-E] prefix
- Returns only non-expired, active signals

## Required Fixes

### Task 2: Fix RTB TTL
- Change TTL from 15 minutes to 30 seconds
- Add `RTB_TTL_SECONDS` configuration constant

### Task 3: Active Trade Rejection
- Add check in `evaluateSymbol()` before RTB enqueue
- Use `storage.getActiveTrades(mode)` to check for open positions
- Add `[8.8.3-I][RTB_REJECT_ACTIVE]` logging

### Task 4: RTB Deduping
- Already implemented via DELETE before INSERT
- Newer signals already override older ones
- ✅ No changes needed

### Task 5: Simulation Reset Cleanup
- Add `deleteAllTradingSignals(mode)` method to storage
- Call it during simulation reset
- Add `[8.8.3-I][RTB_RESET]` logging

### Task 6: Trade Execution Consumption
- When trade opens, call `updateSignalStatus()` with 'executed'
- Add `[8.8.3-I][RTB_CONSUMED]` logging

### Task 7: Race Condition Protection
- Current implementation uses database atomicity
- Re-entrancy guard exists in `monitoringCycle()`
- Consider adding mutex for RTB operations if issues persist

### Task 8: WebSocket Verification
- Verify `scan_tick` WebSocket broadcasts include RTB state
- Ensure UI refresh aligns with backend state

## Files to Modify

1. `server/services/paper-execution-engine.ts` - TTL fix, active trade check, consumption
2. `server/storage.ts` - Add `deleteAllTradingSignals()` method
3. `server/routes.ts` - Call RTB cleanup on reset
4. `client/src/components/trading/ready-to-buy-table.tsx` - Verify 30s refresh

## Acceptance Criteria Checklist

- [ ] TTL expiration within 30 seconds
- [ ] No duplicates (unless replacing older signals)
- [ ] No stale signals
- [ ] No RTB entries for symbols actively traded
- [ ] RTB resets on simulation reset
- [ ] Required logging prefixes present
- [ ] API returns only valid, fresh signals

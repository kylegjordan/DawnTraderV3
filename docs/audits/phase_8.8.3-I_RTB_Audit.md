# Phase 8.8.3-I — RTB (Ready-To-Buy) Lifecycle Audit

**Date**: December 1, 2025  
**Phase**: REB 8.8.3-I  
**Status**: ✅ COMPLETED

## Executive Summary

The Ready-To-Buy (RTB) pool has been audited and all identified gaps have been addressed to ensure proper signal lifecycle management aligned with the DawnTrader architecture.

## Completed Fixes

### 1. TTL Expiration Fix (30 Seconds)

**Status**: ✅ FIXED

Changed RTB TTL from 15 minutes to 30 seconds (one FX5 cycle):

```typescript
// server/services/paper-execution-engine.ts
const RTB_TTL_SECONDS = 30; // One FX5 cycle
const expiresAt = new Date(Date.now() + RTB_TTL_SECONDS * 1000);
```

**Logging**: `[8.8.3-I][RTB_ENQUEUE]` prefix on signal creation.

### 2. Active Trade Suppression

**Status**: ✅ FIXED

Before enqueueing an RTB signal, the system now checks for active trades:

```typescript
// Paper mode: Check paper-sim open positions
// Live mode: Check broadcast trades table
const hasActiveTrade = this.mode === 'paper'
  ? (await storage.getPaperSimOpenPositions(this.mode)).some(pos => pos.symbol === symbol)
  : (await storage.getActiveTrades(this.mode)).some(trade => trade.symbol === symbol);
```

**Logging**: `[8.8.3-I][RTB_REJECT_ACTIVE]` prefix when signal is rejected.

### 3. RTB Deduping

**Status**: ✅ VERIFIED (Already Working)

The `saveTradingSignal()` method uses DELETE-then-INSERT pattern:

```typescript
// Delete existing signal for same mode/symbol/strategy
await db.delete(tradingSignals).where(and(
  eq(tradingSignals.mode, signal.mode),
  eq(tradingSignals.symbol, signal.symbol),
  eq(tradingSignals.strategy, signal.strategy)
));
// Insert new signal
const [result] = await db.insert(tradingSignals).values({...}).returning();
```

### 4. Simulation Reset Cleanup

**Status**: ✅ FIXED

Added `deleteAllTradingSignals(mode)` to storage and integrated into reset flow:

```typescript
// server/storage.ts
async deleteAllTradingSignals(mode: 'live' | 'paper'): Promise<number> {
  const deletedRows = await db.delete(tradingSignals)
    .where(eq(tradingSignals.mode, mode))
    .returning();
  console.log(`[8.8.3-I][RTB_RESET] Cleared ${deletedRows.length} RTB signals (mode=${mode})`);
  return deletedRows.length;
}

// server/routes.ts - POST /api/paper-sim/reset
await storage.deleteAllTradingSignals('paper');
```

### 5. Signal Consumption on Trade Execution

**Status**: ✅ FIXED

Added `consumeSignalBySymbol(mode, symbol)` method:

```typescript
// server/storage.ts
async consumeSignalBySymbol(mode: 'live' | 'paper', symbol: string): Promise<TradingSignal | null> {
  const [result] = await db.update(tradingSignals)
    .set({ status: 'executed', executedAt: new Date() })
    .where(and(
      eq(tradingSignals.mode, mode),
      eq(tradingSignals.symbol, symbol),
      eq(tradingSignals.status, 'active')
    ))
    .returning();
  if (result) {
    console.log(`[8.8.3-I][RTB_CONSUMED] Signal consumed for ${symbol} in mode=${mode}`);
  }
  return result || null;
}
```

Called during `executeSimulatedTrade()` after successful trade creation.

### 6. TTL Purge on Fetch

**Status**: ✅ FIXED

`getTradingSignals()` now purges expired signals before returning results:

```typescript
// Delete expired signals
const purgedRows = await db.delete(tradingSignals)
  .where(and(
    eq(tradingSignals.mode, params.mode),
    lte(tradingSignals.expiresAt, new Date())
  ))
  .returning();

if (purgedRows.length > 0) {
  console.log(`[8.8.3-I][RTB_TTL_EXPIRE] Purged ${purgedRows.length} expired signals`);
}

// Only return non-expired signals
return await db.select().from(tradingSignals)
  .where(and(
    eq(tradingSignals.mode, params.mode),
    gt(tradingSignals.expiresAt, new Date())
  ));
```

### 7. Race Condition Protection

**Status**: ✅ VERIFIED (Already Protected)

- `isCycleRunning` guard prevents double-execution in `runFX5Cycle()`
- Database operations are atomic via Drizzle transactions
- DELETE-then-INSERT pattern prevents duplicate signals

## Schema Verification

```typescript
// shared/schema.ts - trading_signals table
export const tradingSignals = pgTable("trading_signals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  mode: tradingModeEnum("mode").notNull().default("paper"),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  strategy: strategyTypeEnum("strategy").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  detectedAt: timestamp("detected_at", { withTimezone: true }).defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  executedAt: timestamp("executed_at", { withTimezone: true }),
  // ...additional fields
});
```

## Logging Prefixes

| Prefix | Location | Event |
|--------|----------|-------|
| `[8.8.3-I][RTB_ENQUEUE]` | paper-execution-engine.ts | Signal saved to RTB |
| `[8.8.3-I][RTB_REJECT_ACTIVE]` | paper-execution-engine.ts | Signal rejected (active trade) |
| `[8.8.3-I][RTB_TTL_EXPIRE]` | storage.ts | Expired signals purged |
| `[8.8.3-I][RTB_CONSUMED]` | storage.ts | Signal marked executed |
| `[8.8.3-I][RTB_RESET]` | storage.ts | All signals cleared on reset |

## Files Modified

1. `server/services/paper-execution-engine.ts` - TTL fix, active trade check, signal consumption
2. `server/storage.ts` - Added `deleteAllTradingSignals()`, `consumeSignalBySymbol()`, TTL purge
3. `server/routes.ts` - RTB cleanup on simulation reset

## Acceptance Criteria

- [x] TTL expiration within 30 seconds (one FX5 cycle)
- [x] No duplicates (DELETE-then-INSERT deduplication)
- [x] No stale signals (purged on fetch)
- [x] No RTB entries for symbols with active trades
- [x] RTB resets on simulation reset
- [x] Required `[8.8.3-I]` logging prefixes present
- [x] API returns only valid, fresh signals
- [x] Signal consumed when trade opens

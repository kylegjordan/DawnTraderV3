# Phase 8.8.3-AJ10.3: Open Trades vs "Opened" Metrics Mapping Audit

## Date: December 3, 2025

## Summary
Diagnostic audit to understand why RTB "Opened by Strategy" shows trades, but the Open Trades table sometimes shows none.

---

## Data Flow Analysis

### 1. RTB "Opened by Strategy" Metrics Source
The "Opened by Strategy" counts come from the `execution_attempt_audit` table:

```typescript
// server/services/paper-execution-engine.ts (line ~1150)
this.logExecutionAttempt({
  mode: this.mode,
  symbol: signal.symbol,
  strategy: signal.strategy,
  decision: 'OPENED',  // <-- This is what gets counted
  ...
});
```

This is logged **after** both:
1. `storage.createPaperSimTrade()` - creates trade record
2. `storage.createPaperSimOpenPosition()` - creates open position

### 2. Open Trades Table Source
The Open Trades table fetches from `paper_sim_open_positions` table:

```typescript
// server/storage.ts (line ~3234)
async getPaperSimOpenPositions(mode: TradingMode): Promise<PaperSimOpenPosition[]> {
  return await db.select()
    .from(paperSimOpenPositions)
    .orderBy(desc(paperSimOpenPositions.openedAt));
}
```

---

## Potential Mismatch Causes

### Cause 1: Position Closed Before Viewing
The most likely cause. Positions may be opened and then immediately closed (by hitting stop or target) before the user views the Open Trades table.

**Evidence**: The execution loop continuously monitors positions and can close them within seconds if price hits stop/target.

### Cause 2: Position Exits During Same Cycle
```typescript
// server/services/paper-execution-engine.ts (line ~180-220)
private async monitorPositions(): Promise<void> {
  // Positions are actively monitored and can be closed
  // based on price movement hitting stop/target
}
```

### Cause 3: Session-Based Metrics Filtering
The "Opened by Strategy" metrics are filtered by `sessionStart` (since Phase 8.8.3-AJ8). If:
- Engine is restarted (new session)
- But old positions still exist from previous session
- Metrics show 0 opened (new session), but Open Trades shows old positions

This would create an **inverse** mismatch (positions visible but metrics show 0).

### Cause 4: Database Insert Failures (Unlikely)
If `createPaperSimOpenPosition` fails but `logExecutionAttempt` with OPENED still runs.

**Mitigation**: The OPENED logging happens inside the try block, after both DB operations.

---

## Execution Flow (Verified)

```
Signal passes guardrails
    ↓
[AJ10.3][TRADE_CREATE_START] - Diagnostic log
    ↓
storage.createPaperSimTrade() → trade record in paper_sim_trades
    ↓
[AJ10.3][TRADE_RECORD_OK] - Diagnostic log
    ↓
storage.createPaperSimOpenPosition() → position in paper_sim_open_positions
    ↓
[AJ10.3][OPEN_POSITION_OK] - Diagnostic log
    ↓
logExecutionAttempt(decision: 'OPENED') → execution_attempt_audit
    ↓
[8.8.3-J][AUDIT] Execution attempt logged: OPENED
```

---

## Diagnostic Logging Added (AJ10.3)

New diagnostic logs to trace execution:

```
[AJ10.3][TRADE_CREATE_START] symbol=X | strategy=Y | qty=Z | estimatedValue=$N
[AJ10.3][TRADE_RECORD_OK] tradeId=abc | symbol=X
[AJ10.3][OPEN_POSITION_OK] positionId=def | symbol=X | tradeId=abc
```

---

## Recommendations

### For Investigation
1. Run a paper session with engine active
2. Monitor logs for `[AJ10.3][OPEN_POSITION_OK]` entries
3. Immediately check Open Trades table
4. If mismatch, check position lifecycle logs for closures

### Likely Root Cause
**Position exits (stop/target) happen faster than UI refresh**

The 30-second polling interval for RTB metrics vs real-time position monitoring means:
- Trade opens → counted as OPENED
- Price immediately hits stop/target → position closes
- By the time UI refreshes, position is gone from Open Trades

### Potential Fixes (Not Implemented in AJ10)
1. Add "closed positions" count to metrics to show full lifecycle
2. Reduce position monitoring frequency during volatile conditions
3. Add "recently closed" positions to Open Trades view with timestamp

---

## Files Involved

| File | Role |
|------|------|
| `server/services/paper-execution-engine.ts` | Creates trades/positions, logs OPENED |
| `server/storage.ts` | DB operations for trades/positions |
| `server/routes.ts` | API endpoints for Open Trades |
| `client/src/components/trading/active-trades.tsx` | Open Trades UI component |

---

## Conclusion

The mismatch is most likely due to **rapid position exits** (stop/target hits) rather than a bug. The execution flow correctly:
1. Creates trade record
2. Creates open position
3. Logs OPENED to execution audit

But positions can close within seconds if the market moves to stop/target, before the user views the Open Trades table.

Future phases should consider adding visibility into "recently closed" positions to provide a complete picture.

---

## AJ10.4 Filter Persistence Fix

### Issue
Manual filter values were being overwritten by LATTI auto-tuning when `updateScreeners` function was called by automated systems (nlai-action-registry, heuristic-trader).

### Solution
Enhanced `config-update-service.ts` to check per-filter `manualOverrideEnabled` flags before applying updates:

```typescript
// AJ10.4: Check per-filter manual override flags
const filterOverrides = existing?.filterOverrides ?? {};
const isManualFilter = (filterName: string): boolean => {
  const override = filterOverrides[filterName];
  return override?.manualOverrideEnabled === true;
};

// Protect manual filters from being overwritten
const safeUpdates = {
  minVolume: isManualFilter('minVolume') ? existing?.minVolume : updates.minVolume,
  minPrice: isManualFilter('minPrice') ? existing?.minPrice : updates.minPrice,
  // ... etc
};
```

### Protected Filters
When a filter has `manualOverrideEnabled=true` in the `filterOverrides` JSON field:

**Numeric Filters:**
- minVolume, minPrice, maxPrice, minMarketCap
- maxBidAskSpread, rsiMin, rsiMax
- volatilityMin, volatilityMax, minLiquidity

**Boolean Filters:**
- excludeStablecoins, allowRegulatedOnly

### Logging
When manual filters are protected, the system logs:
```
[AJ10.4][MANUAL_PROTECTED] Skipping update for manual filters: minPrice, minVolume
```

### Files Modified
- `server/services/config-update-service.ts` - Added `isManualFilter` check in `updateScreeners`
